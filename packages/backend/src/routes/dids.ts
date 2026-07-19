import { Router } from 'express'
import {
  ProvisionDidRequestSchema,
  SearchDidsRequestSchema,
  User,
} from '../../../shared/src/index.js'
import { HttpError } from '../lib/errors.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail.js'
import { DidProvisioningService } from '../services/didProvisioningService.js'

export function createDidsRouter(service: DidProvisioningService) {
  const router = Router()

  // Provisioned DIDs visible to the caller's tenant.
  router.get(
    '/',
    asyncHandler((_request, response) => {
      const user = response.locals.user as User
      response.json({ items: service.listForTenant(user.tenantId) })
    })
  )

  // Numbers available to order from the trunk provider.
  router.get(
    '/search',
    requireAdmin,
    asyncHandler(async (request, response) => {
      const input = SearchDidsRequestSchema.parse({
        country: request.query.country ?? 'US',
        query:
          typeof request.query.query === 'string'
            ? request.query.query
            : undefined,
      })
      response.json({ items: await service.searchDids(input) })
    })
  )

  // Provision a DID and bind it to a (new or existing) mailbox.
  router.post(
    '/',
    requireAdmin,
    requireVerifiedEmail,
    asyncHandler(async (request, response) => {
      const user = response.locals.user as User
      const input = parseBody(ProvisionDidRequestSchema, request.body)
      const did = await service.provision(user.tenantId, input, user.id)
      response.status(201).json({ did })
    })
  )

  router.delete(
    '/:number',
    requireAdmin,
    asyncHandler(async (request, response) => {
      const user = response.locals.user as User
      const number = Array.isArray(request.params.number)
        ? request.params.number[0]
        : request.params.number
      if (!number) throw new HttpError(400, 'DID number is required.')
      await service.release(user.tenantId, number, user.id)
      response.status(204).end()
    })
  )

  return router
}
