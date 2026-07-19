import {
  AvailableDid,
  ProvisionDidRequest,
  ProvisionedDid,
} from '../../../shared/src/index.js'
import { HttpError } from '../lib/errors.js'
import { assertTenantActive } from '../lib/tenantGuards.js'
import { db } from '../db/client.js'
import { auditRepository } from '../repositories/auditRepository.js'
import { didRepository } from '../repositories/didRepository.js'
import { mailboxRepository } from '../repositories/mailboxRepository.js'
import { tenantLimitsRepository } from '../repositories/tenantLimitsRepository.js'
import { createSipTrunkProvider, SipTrunkProvider } from '../providers/sip/index.js'
import { BillingService } from './billingService.js'

/**
 * Orders DIDs from the SIP trunk provider on the fly and binds them to a
 * tenant's mailbox. Because every DID routes to one shared trunk, "provisioning"
 * is: order the number, record it, and set a mailbox's `number` to it — inbound
 * routing ([resolveInbound]) then lands its calls in that tenant. Release
 * reverses it.
 */
export class DidProvisioningService {
  constructor(
    private readonly provider: SipTrunkProvider = createSipTrunkProvider(),
    private readonly billingService: BillingService = new BillingService()
  ) {}

  searchDids(input: { country: 'US' | 'CA'; query?: string }): Promise<
    AvailableDid[]
  > {
    return this.provider.searchDids(input)
  }

  listForTenant(tenantId: string): ProvisionedDid[] {
    return didRepository.listByTenant(tenantId)
  }

  async provision(
    tenantId: string,
    input: ProvisionDidRequest,
    actor = 'system'
  ): Promise<ProvisionedDid> {
    // Frozen tenants (chargeback/owner action) may not order numbers.
    assertTenantActive(tenantId)
    // Reserve a finite plan slot synchronously before awaiting the provider, so
    // concurrent requests cannot both pass the cap and incur carrier cost.
    const limits = tenantLimitsRepository.get(tenantId)
    const reservation = didRepository.reserveProvisioning(
      tenantId,
      input.number,
      limits.maxDids
    )
    if (reservation === 'number_unavailable') {
      throw new HttpError(409, 'That number is already provisioned or pending.')
    }
    if (reservation === 'limit_reached') {
      throw new HttpError(
        403,
        `DID limit reached (${limits.maxDids}). Upgrade the plan to add more.`
      )
    }

    let orderedNumber: string | null = null
    let committed = false
    try {
      // A DID rents monthly against the wallet — require settled funds before
      // ordering. Paid fake-provider tenants exercise this exact same gate.
      this.billingService.assertHasBalance(tenantId)
      const existingMailboxId = this.validateTargetMailbox(tenantId, input)
      const ordered = await this.provider.orderDid(input.number)
      orderedNumber = ordered.number

      const did = db.transaction(() => {
        const mailboxId =
          existingMailboxId ??
          mailboxRepository.create({
            name: input.mailboxName ?? `Line ${ordered.number}`,
            number: null,
            sipAccountRef: null,
            greetingPromptId: null,
            tenantId,
          }).id
        mailboxRepository.update(mailboxId, { number: ordered.number })
        const created = didRepository.create({
          tenantId,
          number: ordered.number,
          provider: this.provider.id,
          monthlyCents: ordered.monthlyCents,
          perMinuteCents: ordered.perMinuteCents,
          mailboxId,
        })
        didRepository.releaseProvisioningReservation(tenantId, input.number)
        auditRepository.record({
          actor,
          action: 'did.provision',
          tenantId,
          detail: { number: created.number, monthlyCents: created.monthlyCents },
        })
        return created
      })()
      committed = true
      return did
    } catch (error) {
      // If local persistence fails after the provider order, best-effort release
      // avoids an untracked monthly rental.
      if (orderedNumber && !committed) {
        await this.provider.releaseDid(orderedNumber).catch(() => undefined)
      }
      throw error
    } finally {
      didRepository.releaseProvisioningReservation(tenantId, input.number)
    }
  }

  async release(tenantId: string, number: string, actor = 'system'): Promise<void> {
    const did = didRepository.getByNumber(number)
    if (!did || didRepository.tenantIdOf(number) !== tenantId) {
      throw new HttpError(404, 'DID not found.')
    }
    if (did.status === 'released') return

    await this.provider.releaseDid(number)
    didRepository.markReleased(number)
    // Stop routing calls to the now-released number.
    if (did.mailboxId) {
      mailboxRepository.update(did.mailboxId, { number: null })
    }
    auditRepository.record({
      actor,
      action: 'did.release',
      tenantId,
      detail: { number },
    })
  }

  private validateTargetMailbox(
    tenantId: string,
    input: ProvisionDidRequest
  ): string | null {
    if (input.mailboxId) {
      const mailbox = mailboxRepository.getById(input.mailboxId)
      const inTenant = mailboxRepository
        .list(tenantId)
        .some(m => m.id === input.mailboxId)
      if (!mailbox || !inTenant) {
        throw new HttpError(404, 'Mailbox not found.')
      }
      return input.mailboxId
    }

    return null
  }
}
