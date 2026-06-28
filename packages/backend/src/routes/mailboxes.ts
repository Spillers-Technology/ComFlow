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
      // Ensure the default mailbox exists so the admin page always has one.
      service.getDefault()
      // Members see only the mailboxes their groups grant; admins see all.
      const user = response.locals.user as User
      response.json({
        items: accessService.filterMailboxes(user, service.list()),
      })
    })
  )

  router.post(
    '/',
    requireAdmin,
    asyncHandler((request, response) => {
      const input = parseBody(CreateMailboxRequestSchema, request.body)
      const mailbox = service.create(input)
      response.status(201).json({ mailbox })
    })
  )

  router.patch(
    '/:id',
    requireAdmin,
    asyncHandler((request, response) => {
      const id = Array.isArray(request.params.id)
        ? request.params.id[0]
        : request.params.id
      if (!id) {
        throw new HttpError(400, 'Mailbox id is required.')
      }
      const input = parseBody(UpdateMailboxRequestSchema, request.body)
      const mailbox = service.update(id, input)
      response.json({ mailbox })
    })
  )

  router.delete(
    '/:id',
    requireAdmin,
    asyncHandler((request, response) => {
      const id = Array.isArray(request.params.id)
        ? request.params.id[0]
        : request.params.id
      if (!id) {
        throw new HttpError(400, 'Mailbox id is required.')
      }
      service.remove(id)
      response.status(204).end()
    })
  )

  return router
}
