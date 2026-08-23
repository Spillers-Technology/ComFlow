import { Router } from 'express'
import {
  PLAN_CATALOG,
  PURCHASABLE_BANDS,
  SubscribeRequestSchema,
  TopUpRequestSchema,
  User,
} from '../../../shared/src/index.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail.js'
import { BillingService } from '../services/billingService.js'

export function createBillingRouter(billingService: BillingService) {
  const router = Router()

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

  // The public price list. Open to any signed-in user so onboarding can render
  // the bands before the account has any billing history.
  router.get('/plans', (_request, response) => {
    response.json({
      plans: PURCHASABLE_BANDS.map(band => PLAN_CATALOG[band]),
    })
  })

  router.get(
    '/subscription',
    asyncHandler((_request, response) => {
      const user = response.locals.user as User
      response.json({
        subscription: billingService.subscription(user.tenantId),
      })
    })
  )

  // Start a Stripe Checkout that subscribes this tenant to a band.
  router.post(
    '/subscribe',
    requireAdmin,
    requireVerifiedEmail,
    asyncHandler(async (request, response) => {
      const user = response.locals.user as User
      const input = parseBody(SubscribeRequestSchema, request.body)
      const checkoutUrl = await billingService.startSubscription(
        user.tenantId,
        input.band
      )
      response.status(201).json({ checkoutUrl })
    })
  )

  // Hand off to Stripe's hosted portal for plan changes, cards, and cancelling.
  router.post(
    '/portal',
    requireAdmin,
    asyncHandler(async (_request, response) => {
      const user = response.locals.user as User
      const portalUrl = await billingService.portalUrl(user.tenantId)
      response.status(201).json({ portalUrl })
    })
  )

  return router
}
