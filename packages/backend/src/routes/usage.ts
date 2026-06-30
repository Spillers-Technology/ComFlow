import { Router } from 'express'
import { User } from '../../../shared/src/index.js'
import { asyncHandler } from '../lib/http.js'
import { UsageService } from '../services/usageService.js'

export function createUsageRouter(usageService: UsageService) {
  const router = Router()

  // Transparent usage + cost breakdown for the caller's tenant this month.
  router.get(
    '/',
    asyncHandler((_request, response) => {
      const user = response.locals.user as User
      response.json({ summary: usageService.summary(user.tenantId) })
    })
  )

  return router
}
