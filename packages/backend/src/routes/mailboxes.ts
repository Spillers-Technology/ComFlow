import { Router } from 'express'
import {
  CreateMailboxRequestSchema,
  UpdateMailboxRequestSchema,
  User,
} from '../../../shared/src/index.js'
import { HttpError } from '../lib/errors.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { accessService } from '../services/accessService.js'
import { MailboxService } from '../services/mailboxService.js'

export function createMailboxesRouter(service: MailboxService) {
  const router = Router()

  router.get(
    '/',
    asyncHandler((_request, response) => {
      const user = response.locals.user as User
      // Ensure the tenant's default mailbox exists so the page always has one.
      service.getDefault(user.tenantId)
      // Members see only the mailboxes their groups grant; admins see all in
      // their tenant.
      response.json({
        items: accessService.filterMailboxes(
          user,
          service.list(user.tenantId)
        ),
      })
    })
  )

  router.post(
    '/',
    requireAdmin,
    asyncHandler((request, response) => {
      const user = response.locals.user as User
      const input = parseBody(CreateMailboxRequestSchema, request.body)
      const mailbox = service.create(input, user.tenantId)
      response.status(201).json({ mailbox })
    })
  )

  router.patch(
    '/:id',
    requireAdmin,
    asyncHandler((request, response) => {
      const user = response.locals.user as User
      const id = Array.isArray(request.params.id)
        ? request.params.id[0]
        : request.params.id
      if (!id) {
        throw new HttpError(400, 'Mailbox id is required.')
      }
      const input = parseBody(UpdateMailboxRequestSchema, request.body)
      const mailbox = service.update(id, input, user.tenantId)
      response.json({ mailbox })
    })
  )

  router.delete(
    '/:id',
    requireAdmin,
    asyncHandler((request, response) => {
      const user = response.locals.user as User
      const id = Array.isArray(request.params.id)
        ? request.params.id[0]
        : request.params.id
      if (!id) {
        throw new HttpError(400, 'Mailbox id is required.')
      }
      service.remove(id, user.tenantId)
      response.status(204).end()
    })
  )

  return router
}
