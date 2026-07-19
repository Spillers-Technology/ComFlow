import { Router } from 'express'
import {
  CreateScheduledCallRequestSchema,
  User,
} from '../../../shared/src/index.js'
import { HttpError } from '../lib/errors.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail.js'
import { ScheduledCallService } from '../services/scheduledCallService.js'

function paramId(value: unknown): string {
  const id = Array.isArray(value) ? value[0] : value
  if (typeof id !== 'string' || !id) {
    throw new HttpError(400, 'Scheduled call id is required.')
  }
  return id
}

export function createScheduledCallsRouter(service: ScheduledCallService) {
  const router = Router()

  router.get(
    '/',
    asyncHandler((_request, response) => {
      const user = response.locals.user as User
      response.json({ items: service.list(user.tenantId) })
    })
  )

  router.post(
    '/',
    requireVerifiedEmail,
    asyncHandler((request, response) => {
      const user = response.locals.user as User
      const input = parseBody(CreateScheduledCallRequestSchema, request.body)
      const scheduledCall = service.create(input, user.tenantId)
      response.status(201).json({ scheduledCall })
    })
  )

  router.delete(
    '/:id',
    asyncHandler((request, response) => {
      const user = response.locals.user as User
      const scheduledCall = service.cancel(paramId(request.params.id), user.tenantId)
      response.json({ scheduledCall })
    })
  )

  router.get(
    '/:id/answer-audio',
    asyncHandler((request, response) => {
      const user = response.locals.user as User
      const { absolutePath } = service.getAnswerAudio(
        paramId(request.params.id),
        user.tenantId
      )
      response.type('audio/wav')
      response.sendFile(absolutePath)
    })
  )

  return router
}
