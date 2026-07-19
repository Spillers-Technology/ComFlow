import { Router } from 'express'
import {
  OutboundAccessRequestSchema,
  User,
} from '../../../shared/src/index.js'
import { config } from '../config.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail.js'
import { auditRepository } from '../repositories/auditRepository.js'
import { tenantLimitsRepository } from '../repositories/tenantLimitsRepository.js'
import { tenantRepository } from '../repositories/tenantRepository.js'
import { EmailNotificationService } from '../services/emailNotificationService.js'

export function createOutboundRouter(
  emailService: Pick<EmailNotificationService, 'sendOutboundAccessRequest'>
) {
  const router = Router()

  router.get(
    '/',
    asyncHandler((_request, response) => {
      const user = response.locals.user as User
      response.json({
        enabled: tenantLimitsRepository.get(user.tenantId).outboundEnabled,
        maxPerDay: config.outbound.maxPerDay,
        maxSpendPerDayCents: config.outbound.maxSpendPerDayCents,
      })
    })
  )

  // Ask for outbound access. This never grants anything — it notifies the team,
  // who enable it by hand after speaking to the customer.
  router.post(
    '/request',
    requireAdmin,
    requireVerifiedEmail,
    asyncHandler(async (request, response) => {
      const user = response.locals.user as User
      const input = parseBody(OutboundAccessRequestSchema, request.body)
      const tenant = tenantRepository.getById(user.tenantId)

      auditRepository.record({
        actor: user.id,
        action: 'outbound.access_requested',
        tenantId: user.tenantId,
        detail: {
          useCase: input.useCase,
          contactPhone: input.contactPhone,
          consentAttested: input.consentAttested,
        },
      })

      // The audit row is the durable record, so a mail failure must not lose the
      // request or 500 at the customer — the operator can find it either way.
      try {
        await emailService.sendOutboundAccessRequest({
          tenantName: tenant?.name ?? user.tenantId,
          tenantId: user.tenantId,
          requestedBy: user.email,
          useCase: input.useCase,
          contactPhone: input.contactPhone,
        })
      } catch (error) {
        console.error('[outbound] request notification failed', error)
      }

      response.status(201).json({ received: true })
    })
  )

  return router
}
