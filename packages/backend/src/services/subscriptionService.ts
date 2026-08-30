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
      description: subscriptionPlan.description,
      priceCents: subscriptionPlan.priceCents,
      currency: subscriptionPlan.currency,
      interval: subscriptionPlan.interval,
      maxDids: limits.maxDids,
      includedMinutes: limits.includedMinutes,
      maxConcurrentCalls: limits.maxConcurrentCalls,
      // Usage beyond the included allowance draws the wallet at the same
      // markup self-registration already applies to metered usage — one
      // markup number instead of a second copy living in billing config.
      overageMarkupBps: limits.markupBps,
      taxBehavior: 'exclusive',
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

/**
 * Usable also covers the bounded past-due grace window (see
 * `config.billing.subscriptionGraceDays`): a failed renewal keeps granting
 * service until `subscriptionGracePeriodEnd` so a customer has time to fix
 * their payment method before losing the DID. Requires a recognized `plan`
 * (an active/trialing row for a Stripe price we don't map to a plan must
 * never grant service — see `applyEvent`, which now refuses to store one)
 * and a `currentPeriodEnd` that hasn't clearly lapsed, so a stale local
 * "active" row left behind by a missed terminal webhook fails closed instead
 * of granting service indefinitely until someone happens to call reconcile.
 */
function isUsable(
  billing: Pick<
    TenantBilling,
    'subscriptionStatus' | 'subscriptionGracePeriodEnd' | 'plan' | 'currentPeriodEnd'
  >
): boolean {
  if (!billing.plan) return false
  if (billing.subscriptionStatus === 'active' || billing.subscriptionStatus === 'trialing') {
    return Boolean(billing.currentPeriodEnd) && Date.parse(billing.currentPeriodEnd!) > Date.now()
  }
  if (billing.subscriptionStatus === 'past_due' && billing.subscriptionGracePeriodEnd) {
    return Date.parse(billing.subscriptionGracePeriodEnd) > Date.now()
  }
  return false
}

/**
 * The grace-period end to persist alongside a status transition. Anchored to
 * the billing period that failed to renew (`currentPeriodEnd`), not to when
 * we happened to process a given webhook — Stripe's dunning retries fire a
 * fresh `invoice.payment_failed` (a new event id) every few days for the
 * *same* failed period, and event-id idempotency does not deduplicate across
 * those. Anchoring to processing time let repeated retries push the grace
 * window out indefinitely; anchoring to `currentPeriodEnd` instead means
 * every event about the same unpaid period computes the same grace end, and
 * the window only genuinely moves once Stripe reports a new period.
 */
function graceUntil(
  status: TenantBilling['subscriptionStatus'],
  currentPeriodEnd: string
): string | null {
  if (status !== 'past_due') return null
  const days = config.billing.subscriptionGraceDays
  if (!Number.isFinite(days) || days <= 0) return null
  return new Date(Date.parse(currentPeriodEnd) + days * 24 * 60 * 60 * 1000).toISOString()
}

function toSubscription(billing: TenantBilling): Subscription {
  return {
    status: billing.subscriptionStatus ?? 'none',
    planId: billing.plan,
    currentPeriodStart: billing.currentPeriodStart,
    currentPeriodEnd: billing.currentPeriodEnd,
    gracePeriodEnd: billing.subscriptionGracePeriodEnd,
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
    usable: isUsable(billing),
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
    return isUsable(billingRepository.get(tenantId))
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
    if (isUsable(billing)) {
      throw new HttpError(409, 'This tenant already has an active subscription.')
    }

    const checkoutId = `pending_${tenantId}_${Date.now()}`
    // Returns a 3-way outcome, not a boolean: 'reserved' is the only success
    // case, and both failure cases (already subscribed since we last read
    // `billing`, or a concurrent checkout still pending) must 409 — this is
    // the atomic guard against opening two concurrent subscription Checkout
    // sessions for one tenant, so every non-'reserved' outcome has to reject.
    const reservation = billingRepository.reserveSubscriptionCheckout(
      tenantId,
      checkoutId
    )
    if (reservation === 'already_subscribed') {
      throw new HttpError(409, 'This tenant already has an active subscription.')
    }
    if (reservation === 'checkout_pending') {
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
        // Stable per reservation, not per attempt: if this call is retried
        // (e.g. after a network error) before the reservation is released, it
        // must reuse the same Stripe Checkout session rather than create a
        // second one under the same reservation.
        idempotencyKey: checkoutId,
      })
      // Replace our placeholder reservation key with the real provider
      // session id once one exists, so a later `subscription_checkout_expired`
      // webhook (which carries Stripe's own session id, not our placeholder)
      // can find and release this exact reservation. Best-effort: if the
      // provider didn't return one, the reservation still expires on its own
      // after 24h.
      if (session.sessionId) {
        billingRepository.bindSubscriptionCheckout(tenantId, checkoutId, session.sessionId)
      }
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
    const billing = billingRepository.get(tenantId)

    // Events about a subscription id other than the tenant's current one are
    // stale/superseded (e.g. a delayed `customer.subscription.deleted` for an
    // old subscription arriving after a replacement already went active) and
    // must never mutate the tenant's *current* subscription state.
    // `subscription_active` is deliberately exempt: it is the signal that a
    // (possibly new, replacement) subscription is now the truth, and Stripe
    // is authoritative for that — gating it on the previously-stored id would
    // block a legitimate reactivation under a fresh subscription id.
    function rejectIfStale(eventSubscriptionId: string): boolean {
      if (billing.subscriptionId === null || billing.subscriptionId === eventSubscriptionId) {
        return false
      }
      auditRepository.record({
        actor: 'system:billing-webhook',
        action: 'subscription.stale_event_ignored',
        tenantId,
        detail: {
          eventType: event.type,
          eventSubscriptionId,
          currentSubscriptionId: billing.subscriptionId,
          eventId: event.id,
        },
      })
      return true
    }

    switch (event.type) {
      case 'subscription_active':
      case 'subscription_updated': {
        if (event.type === 'subscription_updated' && rejectIfStale(event.subscriptionId)) return
        // 'subscription_active' for a *different* subscription id is normally
        // trusted outright (see the comment on `rejectIfStale` above — a
        // legitimate replacement subscription must be able to win). But an
        // out-of-order redelivery of an *older* active event for a
        // subscription that has since been superseded looks the same on the
        // wire; the one thing that distinguishes it is that its own period
        // necessarily started before the currently-stored subscription's
        // period did. Reject only that case, so replays can't roll a tenant
        // back to a subscription it has already moved on from.
        if (
          event.type === 'subscription_active' &&
          billing.subscriptionId &&
          billing.subscriptionId !== event.subscriptionId &&
          billing.subscriptionStatus !== 'canceled' &&
          billing.currentPeriodStart &&
          Date.parse(event.currentPeriodStart) < Date.parse(billing.currentPeriodStart)
        ) {
          auditRepository.record({
            actor: 'system:billing-webhook',
            action: 'subscription.stale_event_ignored',
            tenantId,
            detail: {
              eventType: event.type,
              eventSubscriptionId: event.subscriptionId,
              currentSubscriptionId: billing.subscriptionId,
              eventId: event.id,
            },
          })
          return
        }
        billingRepository.setSubscriptionState(tenantId, {
          subscriptionId: event.subscriptionId,
          // An active/trialing row for a Stripe price this deployment
          // doesn't recognize must never grant service — leaving the
          // previous plan in place here (like `reconcile` already does)
          // would let an unrecognized/misconfigured price ride on the last
          // known-good plan's entitlement.
          plan: planIdForPrice(event.priceId),
          status: event.status,
          priceId: event.priceId,
          currentPeriodStart: event.currentPeriodStart,
          currentPeriodEnd: event.currentPeriodEnd,
          // 'subscription_updated' can carry a non-active status (e.g.
          // past_due mid-dunning) as much as 'subscription_active' carries
          // active/trialing, so both go through the same grace computation.
          gracePeriodEnd: graceUntil(event.status, event.currentPeriodEnd),
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
        if (rejectIfStale(event.subscriptionId)) return
        const gracePeriodEnd = graceUntil(event.status, event.currentPeriodEnd)
        billingRepository.markSubscriptionPaymentFailed(tenantId, {
          subscriptionId: event.subscriptionId,
          plan: planIdForPrice(event.priceId) ?? billing.plan,
          status: event.status,
          priceId: event.priceId,
          currentPeriodStart: event.currentPeriodStart,
          currentPeriodEnd: event.currentPeriodEnd,
          gracePeriodEnd,
          cancelAtPeriodEnd: event.cancelAtPeriodEnd,
        })
        auditRepository.record({
          actor: 'system:billing-webhook',
          action: 'subscription.payment_failed',
          tenantId,
          detail: {
            subscriptionId: event.subscriptionId,
            eventId: event.id,
            status: event.status,
            gracePeriodEnd,
          },
        })
        return
      }
      case 'subscription_canceled': {
        if (rejectIfStale(event.subscriptionId)) return
        billingRepository.markSubscriptionCanceled(tenantId)
        auditRepository.record({
          actor: 'system:billing-webhook',
          action: 'subscription.canceled',
          tenantId,
          detail: { subscriptionId: event.subscriptionId, eventId: event.id },
        })
        return
      }
      case 'subscription_checkout_expired': {
        // Stripe's own signal that an abandoned Checkout session is
        // definitively gone — the authoritative way to release the pending
        // reservation, rather than guessing at release time based on our own
        // request errors (see `startCheckout`'s catch block, which does not
        // release on ambiguous provider-call failures).
        billingRepository.releaseSubscriptionCheckoutReservation(
          tenantId,
          event.checkoutId
        )
        auditRepository.record({
          actor: 'system:billing-webhook',
          action: 'subscription.checkout_expired',
          tenantId,
          detail: { checkoutId: event.checkoutId, eventId: event.id },
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
    if (!billing.subscriptionId || !isUsable(billing)) {
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
    if (!billing.subscriptionId || !isUsable(billing)) {
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
      currentPeriodStart: billing.currentPeriodStart ?? new Date().toISOString(),
      currentPeriodEnd: billing.currentPeriodEnd ?? new Date().toISOString(),
      gracePeriodEnd: billing.subscriptionGracePeriodEnd,
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
      billing.currentPeriodStart !== remote.currentPeriodStart ||
      billing.currentPeriodEnd !== remote.currentPeriodEnd ||
      billing.cancelAtPeriodEnd !== remote.cancelAtPeriodEnd

    if (changed) {
      billingRepository.setSubscriptionState(tenantId, {
        subscriptionId: remote.id,
        // Fail closed like `applyEvent` does: a live Stripe price this
        // deployment doesn't recognize must not keep riding on whatever plan
        // was last known-good — that would let a misconfigured/retired price
        // stay "usable" indefinitely via the repair path.
        plan: planIdForPrice(remote.priceId),
        status: remote.status,
        priceId: remote.priceId,
        currentPeriodStart: remote.currentPeriodStart,
        currentPeriodEnd: remote.currentPeriodEnd,
        gracePeriodEnd: graceUntil(remote.status, remote.currentPeriodEnd),
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
