import { Router } from 'express'
import { TopUpRequestSchema, User } from '../../../shared/src/index.js'
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

  return router
}
