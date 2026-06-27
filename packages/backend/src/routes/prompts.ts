import { Router } from 'express'
import {
  AudioPromptKindSchema,
  CreateAudioPromptRequestSchema,
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
      const kind = request.query.kind
        ? AudioPromptKindSchema.parse(request.query.kind)
        : undefined
      response.json({ items: service.list(kind) })
    })
  )

  router.post(
    '/',
    asyncHandler(async (request, response) => {
      const input = parseBody(CreateAudioPromptRequestSchema, request.body)
      const prompt = await service.create(input)
      response.status(201).json({ prompt })
    })
  )

  router.delete(
    '/:id',
    asyncHandler(async (request, response) => {
      await service.delete(paramId(request.params.id))
      response.status(204).end()
    })
  )

  router.get(
    '/:id/audio',
    asyncHandler((request, response) => {
      const { absolutePath, mimeType } = service.getAudio(
        paramId(request.params.id)
      )
      response.type(mimeType)
      response.sendFile(absolutePath)
    })
  )

  return router
}
