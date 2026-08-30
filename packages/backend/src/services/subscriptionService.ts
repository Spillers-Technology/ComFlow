import { Plan, Subscription } from '../../../shared/src/index.js'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'
import { assertTenantActive } from '../lib/tenantGuards.js'
import { auditRepository } from '../repositories/auditRepository.js'
import { billingRepository, TenantBilling } from '../repositories/billingRepository.js'
import { userRepository } from '../repositories/userRepository.js'
import {
  BillingProvider,
  createBillingProvider,
  PaymentEvent,
} from '../providers/billing/index.js'

/**
 * The one sellable plan today, assembled from the same env-configured
 * capacity numbers self-registration already materializes into
 * `tenant_limits` — one source of truth for "what does Solo include" instead
 * of a second copy living in billing config.
 */
export function getPlanCatalog(): Plan[] {
  const { subscriptionPlan } = config.billing
  const limits = config.selfRegistration.planLimits
  return [
    {
      id: subscriptionPlan.id,
      name: subscriptionPlan.name,
      priceCents: subscriptionPlan.priceCents,
      interval: subscriptionPlan.interval,
      maxDids: limits.maxDids,
      includedMinutes: limits.includedMinutes,
      maxConcurrentCalls: limits.maxConcurrentCalls,
    },
  ]
}

export function getPlan(planId: string): Plan | undefined {
  return getPlanCatalog().find(plan => plan.id === planId)
}

/** The provider price id a plan's Checkout/price-change calls should target. */
function priceIdForPlan(planId: string): string {
  const plan = getPlan(planId)
  if (!plan) throw new HttpError(400, `Unknown plan: ${planId}`)
  // Stripe test-mode credentials aren't available in every environment this
  // runs in (see the fake provider); fall back to a stable synthetic id so
  // dev/tests never depend on STRIPE_SOLO_PRICE_ID being set.
  if (planId === config.billing.subscriptionPlan.id) {
    return config.billing.subscriptionPlan.stripePriceId ?? `local_price_${planId}`
  }
  return `local_price_${planId}`
}

function planIdForPrice(priceId: string): string | null {
  return getPlanCatalog().find(plan => priceIdForPlan(plan.id) === priceId)?.id ?? null
}

function isUsable(status: TenantBilling['subscriptionStatus']): boolean {
  return status === 'active' || status === 'trialing'
}

function toSubscription(billing: TenantBilling): Subscription {
  return {
    status: billing.subscriptionStatus ?? 'none',
    planId: billing.plan,
    currentPeriodEnd: billing.currentPeriodEnd,
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
    usable: isUsable(billing.subscriptionStatus),
  }
}

/**
 * Recurring Stripe subscriptions. A subscription becoming active/trialing
 * grants the plan's DID and included minutes directly (see
 * `BillingService.assertCanProvisionDid`) — the wallet BillingService already
 * implements stays reserved for usage overage. Webhook dispatch and
 * event-id idempotency live in `BillingService.handleWebhook`, which calls
 * into `applyEvent` here; this class does not re-implement that plumbing.
 */
export class SubscriptionService {
  constructor(
    private readonly provider: BillingProvider = createBillingProvider()
  ) {}

  planCatalog(): Plan[] {
    return getPlanCatalog()
  }

  status(tenantId: string): Subscription {
    return toSubscription(billingRepository.get(tenantId))
  }

  /** Whether a tenant's subscription alone should unlock plan-included service. */
  isUsable(tenantId: string): boolean {
    return isUsable(billingRepository.get(tenantId).subscriptionStatus)
  }

  private tenantBillingEmail(tenantId: string): string | null {
    const admin = userRepository
      .list(tenantId)
      .find(user => user.role === 'admin' || user.role === 'owner')
    return admin?.email ?? null
  }

  /**
   * Start a Checkout session for the tenant's first (or replacement)
   * subscription. Durably guarded so a tenant cannot open two concurrent
   * subscription Checkout sessions — mirrors the wallet top-up reservation.
   */
  async startCheckout(tenantId: string, planId: string): Promise<string> {
    assertTenantActive(tenantId)
    const plan = getPlan(planId)
    if (!plan) throw new HttpError(400, `Unknown plan: ${planId}`)

    const billing = billingRepository.get(tenantId)
    if (isUsable(billing.subscriptionStatus)) {
      throw new HttpError(409, 'This tenant already has an active subscription.')
    }

    const checkoutId = `pending_${tenantId}_${Date.now()}`
    const reserved = billingRepository.reserveSubscriptionCheckout(
      tenantId,
      checkoutId
    )
    if (!reserved) {
      throw new HttpError(
        409,
        'A subscription checkout is already in progress for this tenant. Complete or wait for it to expire before starting another.'
      )
    }

    try {
      const customerId = await this.provider.ensureCustomer({
        tenantId,
        existingCustomerId: billing.stripeCustomerId,
        email: this.tenantBillingEmail(tenantId),
      })
      if (customerId !== billing.stripeCustomerId) {
        billingRepository.setCustomer(tenantId, customerId)
      }
      const session = await this.provider.createSubscriptionCheckout({
        tenantId,
        customerId,
        priceId: priceIdForPlan(planId),
      })
      // The reservation is keyed on our own placeholder id, not the
      // provider's session id — its only job is to durably hold "a checkout
      // is in flight" until a webhook resolves it or the reservation expires.
      return session.url
    } catch (error) {
      billingRepository.releaseSubscriptionCheckoutReservation(tenantId, checkoutId)
      throw error
    }
  }

  /** A Billing Portal session so the customer can manage payment method/invoices. */
  async billingPortalUrl(tenantId: string, returnUrl: string): Promise<string> {
    const billing = billingRepository.get(tenantId)
    if (!billing.stripeCustomerId) {
      throw new HttpError(404, 'No billing customer exists for this tenant yet.')
    }
    const session = await this.provider.createBillingPortalSession({
      customerId: billing.stripeCustomerId,
      returnUrl,
    })
    return session.url
  }

  /** Apply one verified, deduplicated subscription webhook event. Called by BillingService.handleWebhook. */
  applyEvent(tenantId: string, event: PaymentEvent): void {
    switch (event.type) {
      case 'subscription_active':
      case 'subscription_updated': {
        billingRepository.setSubscriptionState(tenantId, {
          subscriptionId: event.subscriptionId,
          plan: planIdForPrice(event.priceId),
          status: event.status,
          priceId: event.priceId,
          currentPeriodEnd: event.currentPeriodEnd,
          cancelAtPeriodEnd: event.cancelAtPeriodEnd,
        })
        // A subscription reactivating out of a wallet-funded dry run doesn't
        // need to touch tenant_limits — the Solo plan's capacity is already
        // materialized at registration (see registrationService). Nothing
        // else to do here beyond recording state for the DID-provisioning
        // gate to read.
        auditRepository.record({
          actor: 'system:billing-webhook',
          action:
            event.type === 'subscription_active'
              ? 'subscription.activated'
              : 'subscription.updated',
          tenantId,
          detail: {
            subscriptionId: event.subscriptionId,
            status: event.status,
            eventId: event.id,
          },
        })
        return
      }
      case 'subscription_payment_failed': {
        billingRepository.markSubscriptionPaymentFailed(tenantId)
        auditRepository.record({
          actor: 'system:billing-webhook',
          action: 'subscription.payment_failed',
          tenantId,
          detail: { subscriptionId: event.subscriptionId, eventId: event.id },
        })
        return
      }
      case 'subscription_canceled': {
        billingRepository.markSubscriptionCanceled(tenantId)
        auditRepository.record({
          actor: 'system:billing-webhook',
          action: 'subscription.canceled',
          tenantId,
          detail: { subscriptionId: event.subscriptionId, eventId: event.id },
        })
        return
      }
      default:
        return
    }
  }

  /** Schedule cancellation for the end of the current billing period; service keeps running until then. */
  async cancelAtPeriodEnd(tenantId: string, actor: string): Promise<void> {
    const billing = billingRepository.get(tenantId)
    if (!billing.subscriptionId || !isUsable(billing.subscriptionStatus)) {
      throw new HttpError(404, 'No active subscription to cancel.')
    }
    await this.provider.cancelSubscription({
      subscriptionId: billing.subscriptionId,
      atPeriodEnd: true,
    })
    billingRepository.setCancelAtPeriodEnd(tenantId, true)
    auditRepository.record({
      actor,
      action: 'subscription.cancel_at_period_end',
      tenantId,
      detail: { subscriptionId: billing.subscriptionId },
    })
  }

  /** Undo a scheduled cancel-at-period-end. */
  async reactivate(tenantId: string, actor: string): Promise<void> {
    const billing = billingRepository.get(tenantId)
    if (!billing.subscriptionId || !billing.cancelAtPeriodEnd) {
      throw new HttpError(
        404,
        'No pending cancellation to reverse for this tenant.'
      )
    }
    await this.provider.reactivateSubscription({
      subscriptionId: billing.subscriptionId,
    })
    billingRepository.setCancelAtPeriodEnd(tenantId, false)
    auditRepository.record({
      actor,
      action: 'subscription.reactivated',
      tenantId,
      detail: { subscriptionId: billing.subscriptionId },
    })
  }

  /** Change which plan (price) an active subscription bills. Scaffolding for when a second plan exists. */
  async changePlan(tenantId: string, planId: string, actor: string): Promise<void> {
    const billing = billingRepository.get(tenantId)
    if (!billing.subscriptionId || !isUsable(billing.subscriptionStatus)) {
      throw new HttpError(404, 'No active subscription to change.')
    }
    const priceId = priceIdForPlan(planId)
    await this.provider.updateSubscriptionPrice({
      subscriptionId: billing.subscriptionId,
      priceId,
    })
    billingRepository.setSubscriptionState(tenantId, {
      subscriptionId: billing.subscriptionId,
      plan: planId,
      status: billing.subscriptionStatus ?? 'active',
      priceId,
      currentPeriodEnd: billing.currentPeriodEnd ?? new Date().toISOString(),
      cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
    })
    auditRepository.record({
      actor,
      action: 'subscription.plan_changed',
      tenantId,
      detail: { subscriptionId: billing.subscriptionId, planId },
    })
  }

  /**
   * Re-sync local subscription state against a fresh provider lookup — the
   * repair path for a missed or delayed webhook. Idempotent: re-running it
   * against already-consistent state reports no change.
   */
  async reconcile(
    tenantId: string
  ): Promise<{ changed: boolean; status: Subscription['status'] }> {
    const billing = billingRepository.get(tenantId)
    if (!billing.subscriptionId && !billing.stripeCustomerId) {
      // No billing relationship exists yet at all — nothing to reconcile.
      return { changed: false, status: 'none' }
    }

    let remote =
      billing.subscriptionId !== null
        ? await this.provider.getSubscription(billing.subscriptionId)
        : null

    // ComFlow never learned a subscription id at all — the actual "missed
    // webhook" failure mode (the webhook that would have recorded the id is
    // the one that got lost), not merely a stale one. Ask the provider what
    // the customer has and adopt the most relevant subscription.
    if (!remote && !billing.subscriptionId && billing.stripeCustomerId) {
      const candidates = await this.provider.listSubscriptionsForCustomer(
        billing.stripeCustomerId
      )
      remote =
        candidates.find(
          subscription =>
            subscription.status === 'active' || subscription.status === 'trialing'
        ) ?? candidates[0] ?? null
    }

    if (!remote) {
      // A customer with no subscription upstream at all (e.g. only ever
      // funded the wallet) is not "canceled" — it never had one to cancel.
      if (billing.subscriptionId === null && billing.subscriptionStatus === null) {
        return { changed: false, status: 'none' }
      }
      // Otherwise this is a previously-known subscription that's gone
      // upstream (e.g. deleted long enough ago to be pruned).
      const changed = billing.subscriptionStatus !== 'canceled'
      if (changed) {
        billingRepository.markSubscriptionCanceled(tenantId)
        auditRepository.record({
          actor: 'system:reconciliation',
          action: 'subscription.reconciled',
          tenantId,
          detail: {
            subscriptionId: billing.subscriptionId,
            from: billing.subscriptionStatus,
            to: 'canceled',
            reason: 'not_found_upstream',
          },
        })
      }
      return { changed, status: 'canceled' }
    }

    const changed =
      billing.subscriptionId !== remote.id ||
      billing.subscriptionStatus !== remote.status ||
      billing.subscriptionPriceId !== remote.priceId ||
      billing.currentPeriodEnd !== remote.currentPeriodEnd ||
      billing.cancelAtPeriodEnd !== remote.cancelAtPeriodEnd

    if (changed) {
      billingRepository.setSubscriptionState(tenantId, {
        subscriptionId: remote.id,
        plan: planIdForPrice(remote.priceId) ?? billing.plan,
        status: remote.status,
        priceId: remote.priceId,
        currentPeriodEnd: remote.currentPeriodEnd,
        cancelAtPeriodEnd: remote.cancelAtPeriodEnd,
      })
      auditRepository.record({
        actor: 'system:reconciliation',
        action: 'subscription.reconciled',
        tenantId,
        detail: {
          subscriptionId: remote.id,
          from: billing.subscriptionStatus,
          to: remote.status,
        },
      })
    }

    return { changed, status: remote.status }
  }
}
