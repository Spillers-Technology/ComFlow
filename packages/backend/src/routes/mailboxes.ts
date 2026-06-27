import { Router } from 'express'
import { UpdateMailboxRequestSchema } from '../../../shared/src/index.js'
import { HttpError } from '../lib/errors.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { MailboxService } from '../services/mailboxService.js'

export function createMailboxesRouter(service: MailboxService) {
  const router = Router()

  router.get(
    '/',
    asyncHandler((_request, response) => {
      // Ensure the default mailbox exists so the admin page always has one.
      service.getDefault()
      response.json({ items: service.list() })
    })
  )

  router.patch(
    '/:id',
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

  return router
}
