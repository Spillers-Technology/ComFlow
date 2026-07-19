import { Wallet } from '../../../shared/src/index.js'
import { config } from '../config.js'
import { db } from '../db/client.js'
import { HttpError } from '../lib/errors.js'
import { assertTenantActive } from '../lib/tenantGuards.js'
import { auditRepository } from '../repositories/auditRepository.js'
import { billingAlertRepository } from '../repositories/billingAlertRepository.js'
import { billingRepository } from '../repositories/billingRepository.js'
import { tenantRepository } from '../repositories/tenantRepository.js'
import { usageRepository } from '../repositories/usageRepository.js'
import { userRepository } from '../repositories/userRepository.js'
import { BillingProvider, createBillingProvider } from '../providers/billing/index.js'
import { EmailNotificationService } from './emailNotificationService.js'

type BillingEmailSender = Pick<
  EmailNotificationService,
  'sendTenantFrozenAlert'
>

/**
 * Prepaid-wallet billing: customers fund a balance via Stripe Checkout; metered
 * usage (UsageService) draws it down. balanceCents = creditCents - billedCents.
 * The single Stripe account collects all tenants' payments, matching the shared
 * VoIP.ms account model.
 */
export class BillingService {
  constructor(
    private readonly provider: BillingProvider = createBillingProvider(),
    private readonly emailService: BillingEmailSender = new EmailNotificationService()
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
    const tenant = tenantRepository.getById(tenantId)
    const paidPlan = Boolean(tenant && tenant.plan !== 'free')
    if (!config.billing.enforced && !paidPlan) return
    if (this.balanceCents(tenantId) <= 0) {
      throw new HttpError(402, 'Wallet balance exhausted. Add funds to continue.')
    }
  }

  assertHostedConfiguration(): void {
    if (!config.selfRegistration.enabled) return
    if (!config.email.notificationsEnabled || config.email.to.length === 0) {
      throw new Error(
        'Hosted self-registration requires notification email and at least one COMFLOW_NOTIFICATION_EMAIL_TO recipient for fraud alerts.'
      )
    }
  }

  /** Start a Stripe Checkout to add wallet credit; returns the redirect URL. */
  async startTopUp(tenantId: string, amountCents: number): Promise<string> {
    // A frozen tenant can't take on more spend (or wash a chargeback with a
    // fresh top-up); the operator has to reactivate it first.
    assertTenantActive(tenantId)
    if (
      !Number.isInteger(config.billing.maxTopUpCents) ||
      config.billing.maxTopUpCents < 500 ||
      amountCents > config.billing.maxTopUpCents
    ) {
      throw new HttpError(
        400,
        `Wallet top-ups are limited to $${(
          config.billing.maxTopUpCents / 100
        ).toFixed(2)} per transaction.`
      )
    }
    const selfRegistered = userRepository.tenantIsSelfRegistered(tenantId)
    let reserved = false
    if (selfRegistered) {
      reserved = db.transaction(() =>
        billingRepository.reserveTopUp(
          tenantId,
          amountCents,
          config.selfRegistration.maxLifetimeCreditCents
        )
      )()
      if (!reserved) {
        throw new HttpError(
          403,
          'This account reached its self-service funding limit. Contact support for review.'
        )
      }
    }

    try {
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
    } catch (error) {
      if (reserved) {
        billingRepository.releaseTopUpReservation(tenantId, amountCents)
      }
      throw error
    }
  }

  /**
   * Apply a verified provider webhook. Settled payments credit the wallet
   * idempotently; a dispute (chargeback) freezes the tenant and alerts the
   * operator.
   */
  async handleWebhook(
    rawBody: Buffer | string,
    signature: string | undefined
  ): Promise<void> {
    const event = await this.provider.parseWebhook({ rawBody, signature })
    if (!event) {
      await this.flushPendingAlerts()
      return
    }

    const tenantId =
      event.type === 'payment_succeeded'
        ? event.tenantId
        : event.tenantId ??
          (event.customerId
            ? billingRepository.tenantIdByCustomer(event.customerId)
            : null)
    if (!tenantId) {
      // Do not mark an unresolved dispute processed. Returning an error asks
      // Stripe to retry after its customer mapping is repaired.
      throw new Error('Billing event could not be mapped to a tenant.')
    }
    const existingTenant = tenantRepository.getById(tenantId)
    if (!existingTenant) {
      throw new Error('Billing event references an unknown tenant.')
    }

    db.transaction(() => {
      if (!billingRepository.markEventProcessed(event.id)) return

      if (event.type === 'payment_succeeded') {
        const billing = billingRepository.get(tenantId)
        const exceedsLifetimeLimit =
          userRepository.tenantIsSelfRegistered(tenantId) &&
          billing.creditCents + event.amountCents >
            config.selfRegistration.maxLifetimeCreditCents
        billingRepository.settleTopUp(tenantId, event.amountCents)
        auditRepository.record({
          actor: 'system:billing-webhook',
          action: 'wallet.credit',
          tenantId,
          detail: {
            amountCents: event.amountCents,
            eventId: event.id,
            exceededLifetimeLimit: exceedsLifetimeLimit,
          },
        })
        if (exceedsLifetimeLimit) {
          const tenant = tenantRepository.update(tenantId, {
            status: 'suspended',
          })!
          const reason =
            'Settled wallet funding exceeded the self-registration lifetime credit limit; review and refund as appropriate.'
          auditRepository.record({
            actor: 'system:billing-webhook',
            action: 'tenant.freeze',
            tenantId,
            detail: {
              reason: 'lifetime_credit_limit_exceeded',
              amountCents: event.amountCents,
              eventId: event.id,
            },
          })
          billingAlertRepository.enqueue({
            eventId: event.id,
            tenantId,
            tenantName: tenant.name,
            reason,
          })
        }
        return
      }

      const tenant = tenantRepository.update(tenantId, { status: 'suspended' })!
      const reason = `Payment dispute (chargeback) of $${(
        event.amountCents / 100
      ).toFixed(2)}`
      auditRepository.record({
        actor: 'system:billing-webhook',
        action: 'tenant.freeze',
        tenantId,
        detail: {
          reason: 'payment_disputed',
          amountCents: event.amountCents,
          eventId: event.id,
        },
      })
      billingAlertRepository.enqueue({
        eventId: event.id,
        tenantId,
        tenantName: tenant.name,
        reason,
      })
    })()

    await this.flushPendingAlerts()
  }

  /** Deliver durable dispute alerts. Failures remain queued for later retries. */
  async flushPendingAlerts(): Promise<void> {
    let failure: Error | null = null
    for (const alert of billingAlertRepository.pending()) {
      try {
        const sent = await this.emailService.sendTenantFrozenAlert({
          tenantName: alert.tenantName,
          tenantId: alert.tenantId,
          reason: alert.reason,
        })
        if (!sent) throw new Error('Notification email transport is disabled.')
        billingAlertRepository.markSent(alert.eventId)
      } catch (error) {
        failure = error as Error
        billingAlertRepository.markFailed(alert.eventId, failure.message)
      }
    }
    if (failure) throw failure
  }

  private tenantBillingEmail(tenantId: string): string | null {
    // Use the tenant's first admin email for the Stripe customer record.
    const admin = userRepository
      .list(tenantId)
      .find(user => user.role === 'admin' || user.role === 'owner')
    return admin?.email ?? null
  }
}
