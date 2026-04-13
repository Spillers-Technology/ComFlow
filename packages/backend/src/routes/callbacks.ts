import { Router } from 'express'
import { HttpError } from '../lib/errors.js'
import { asyncHandler } from '../lib/http.js'
import { CallbackService } from '../services/callbackService.js'

export function createCallbacksRouter(callbackService: CallbackService) {
  const router = Router()

  router.get(
    '/:id/audio',
    asyncHandler((request, response) => {
      const id = Array.isArray(request.params.id)
        ? request.params.id[0]
        : request.params.id
      if (!id) {
        throw new HttpError(400, 'Callback id is required.')
      }

      const { attempt, absolutePath } = callbackService.getAttemptAudio(id)
      response.type(attempt.audioMimeType ?? 'audio/mpeg')
      response.sendFile(absolutePath)
    })
  )

  return router
}
