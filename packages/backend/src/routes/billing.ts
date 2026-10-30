import { Router } from 'express'
import {
  BillingPortalRequestSchema,
  ChangeSubscriptionPlanRequestSchema,
  StartSubscriptionCheckoutRequestSchema,
  TopUpRequestSchema,
  User,
} from '../../../shared/src/index.js'
import { config } from '../config.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail.js'
import { BillingService } from '../services/billingService.js'

export function createBillingRouter(billingService: BillingService) {
  const router = Router()
  const subscriptions = billingService.subscriptions

  // The caller's tenant wallet: credit, usage drawn down, and balance.
  router.get(
    '/',
    asyncHandler((_request, response) => {
      const user = response.locals.user as User
      response.json({ wallet: billingService.wallet(user.tenantId) })
    })
  )

  // Start a Stripe Checkout to add wallet credit (org-admin/owner only).
  router.post(
    '/topup',
    requireAdmin,
    requireVerifiedEmail,
    asyncHandler(async (request, response) => {
      const user = response.locals.user as User
      const input = parseBody(TopUpRequestSchema, request.body)
      const checkoutUrl = await billingService.startTopUp(
        user.tenantId,
        input.amountCents
      )
      response.status(201).json({ checkoutUrl })
    })
  )

  // The one sellable plan today (roadmap M0/M1). Prices/limits before Checkout.
  router.get(
    '/plans',
    asyncHandler((_request, response) => {
      response.json({ plans: subscriptions.planCatalog() })
    })
  )

  // The caller's tenant subscription state.
  router.get(
    '/subscription',
    asyncHandler((_request, response) => {
      const user = response.locals.user as User
      response.json({ subscription: subscriptions.status(user.tenantId) })
    })
  )

  // Start a recurring-subscription Checkout. One charge to start: once active,
  // this alone unlocks the plan's DID — no separate wallet top-up required.
  router.post(
    '/subscription/checkout',
    requireAdmin,
    requireVerifiedEmail,
    asyncHandler(async (request, response) => {
      const user = response.locals.user as User
      const input = parseBody(StartSubscriptionCheckoutRequestSchema, request.body)
      const checkoutUrl = await subscriptions.startCheckout(
        user.tenantId,
        input.planId
      )
      response.status(201).json({ checkoutUrl })
    })
  )

  // A Stripe Billing Portal session so the customer can update payment method,
  // view invoices, or manage the subscription outside of ComFlow's own UI.
  router.post(
    '/subscription/portal',
    requireAdmin,
    asyncHandler(async (request, response) => {
      const user = response.locals.user as User
      const input = parseBody(BillingPortalRequestSchema, request.body ?? {})
      const returnUrl = input.returnUrl ?? `${config.frontendOrigin}/billing`
      const portalUrl = await subscriptions.billingPortalUrl(
        user.tenantId,
        returnUrl
      )
      response.json({ portalUrl })
    })
  )

  // Cancel-at-period-end: service keeps running until the current period ends.
  router.post(
    '/subscription/cancel',
    requireAdmin,
    asyncHandler(async (request, response) => {
      const user = response.locals.user as User
      await subscriptions.cancelAtPeriodEnd(user.tenantId, user.id)
      response.json({ subscription: subscriptions.status(user.tenantId) })
    })
  )

  // Undo a scheduled cancel-at-period-end.
  router.post(
    '/subscription/reactivate',
    requireAdmin,
    asyncHandler(async (request, response) => {
      const user = response.locals.user as User
      await subscriptions.reactivate(user.tenantId, user.id)
      response.json({ subscription: subscriptions.status(user.tenantId) })
    })
  )

  // Plan change. Scaffolding for when a second plan exists — today the
  // catalog has exactly one entry.
  router.post(
    '/subscription/plan',
    requireAdmin,
    requireVerifiedEmail,
    asyncHandler(async (request, response) => {
      const user = response.locals.user as User
      const input = parseBody(ChangeSubscriptionPlanRequestSchema, request.body)
      await subscriptions.changePlan(user.tenantId, input.planId, user.id)
      response.json({ subscription: subscriptions.status(user.tenantId) })
    })
  )

  // Re-sync local subscription state against a fresh provider lookup — the
  // customer-triggerable repair path for a missed or delayed webhook.
  router.post(
    '/subscription/reconcile',
    requireAdmin,
    asyncHandler(async (request, response) => {
      const user = response.locals.user as User
      const result = await subscriptions.reconcile(user.tenantId)
      response.json({
        ...result,
        subscription: subscriptions.status(user.tenantId),
      })
    })
  )

  return router
}
