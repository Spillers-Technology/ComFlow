import { Router } from 'express'
import {
  AudioPromptKindSchema,
  CreateAudioPromptRequestSchema,
  User,
} from '../../../shared/src/index.js'
import { HttpError } from '../lib/errors.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { AudioPromptService } from '../services/audioPromptService.js'

function paramId(value: unknown): string {
  const id = Array.isArray(value) ? value[0] : value
  if (typeof id !== 'string' || !id) {
    throw new HttpError(400, 'Prompt id is required.')
  }
  return id
}

export function createPromptsRouter(service: AudioPromptService) {
  const router = Router()

  router.get(
    '/',
    asyncHandler((request, response) => {
      const user = response.locals.user as User
      const kind = request.query.kind
        ? AudioPromptKindSchema.parse(request.query.kind)
        : undefined
      response.json({ items: service.list(user.tenantId, kind) })
    })
  )

  router.post(
    '/',
    asyncHandler(async (request, response) => {
      const user = response.locals.user as User
      const input = parseBody(CreateAudioPromptRequestSchema, request.body)
      const prompt = await service.create(input, user.tenantId)
      response.status(201).json({ prompt })
    })
  )

  router.delete(
    '/:id',
    asyncHandler(async (request, response) => {
      const user = response.locals.user as User
      await service.delete(paramId(request.params.id), user.tenantId)
      response.status(204).end()
    })
  )

  router.get(
    '/:id/audio',
    asyncHandler((request, response) => {
      const user = response.locals.user as User
      const { absolutePath, mimeType } = service.getAudio(
        paramId(request.params.id),
        user.tenantId
      )
      response.type(mimeType)
      response.sendFile(absolutePath)
    })
  )

  return router
}
