import { Wallet } from '../../../shared/src/index.js'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'
import { billingRepository } from '../repositories/billingRepository.js'
import { usageRepository } from '../repositories/usageRepository.js'
import { userRepository } from '../repositories/userRepository.js'
import { BillingProvider, createBillingProvider } from '../providers/billing/index.js'

/**
 * Prepaid-wallet billing: customers fund a balance via Stripe Checkout; metered
 * usage (UsageService) draws it down. balanceCents = creditCents - billedCents.
 * The single Stripe account collects all tenants' payments, matching the shared
 * VoIP.ms account model.
 */
export class BillingService {
  constructor(
    private readonly provider: BillingProvider = createBillingProvider()
  ) {}

  wallet(tenantId: string): Wallet {
    const billing = billingRepository.get(tenantId)
    const billedCents = usageRepository.totalBilledCents(tenantId)
    return {
      creditCents: billing.creditCents,
      billedCents,
      balanceCents: billing.creditCents - billedCents,
      plan: billing.plan,
      stripeCustomerId: billing.stripeCustomerId,
    }
  }

  balanceCents(tenantId: string): number {
    const billing = billingRepository.get(tenantId)
    return billing.creditCents - usageRepository.totalBilledCents(tenantId)
  }

  /**
   * Throw 402 when a tenant has no remaining balance — gate paid actions. A
   * no-op in self-host/dev where billing isn't enforced.
   */
  assertHasBalance(tenantId: string): void {
    if (!config.billing.enforced) return
    if (this.balanceCents(tenantId) <= 0) {
      throw new HttpError(402, 'Wallet balance exhausted. Add funds to continue.')
    }
  }

  /** Start a Stripe Checkout to add wallet credit; returns the redirect URL. */
  async startTopUp(tenantId: string, amountCents: number): Promise<string> {
    const billing = billingRepository.get(tenantId)
    const email = this.tenantBillingEmail(tenantId)
    const customerId = await this.provider.ensureCustomer({
      tenantId,
      existingCustomerId: billing.stripeCustomerId,
      email,
    })
    if (customerId !== billing.stripeCustomerId) {
      billingRepository.setCustomer(tenantId, customerId)
    }
    const session = await this.provider.createTopUpCheckout({
      tenantId,
      customerId,
      amountCents,
    })
    return session.url
  }

  /** Apply a verified provider webhook, crediting the wallet idempotently. */
  handleWebhook(rawBody: Buffer | string, signature: string | undefined): void {
    const event = this.provider.parseWebhook({ rawBody, signature })
    if (!event) return
    if (!billingRepository.markEventProcessed(event.id)) return // replayed
    billingRepository.addCredit(event.tenantId, event.amountCents)
  }

  private tenantBillingEmail(tenantId: string): string | null {
    // Use the tenant's first admin email for the Stripe customer record.
    const admin = userRepository
      .list(tenantId)
      .find(user => user.role === 'admin' || user.role === 'owner')
    return admin?.email ?? null
  }
}
