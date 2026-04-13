import path from 'node:path'
import { Router } from 'express'
import {
  CallIntentSchema,
  CallStatusSchema,
  CallUpdateInputSchema,
  CreateCallNoteInputSchema,
} from '../../../shared/src/index.js'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { CallReviewService } from '../services/callReviewService.js'

export function createCallsRouter(callReviewService: CallReviewService) {
  const router = Router()

  router.get(
    '/',
    asyncHandler((request, response) => {
      const status = request.query.status
        ? CallStatusSchema.parse(request.query.status)
        : undefined
      const intent = request.query.intent
        ? CallIntentSchema.parse(request.query.intent)
        : undefined
      const assignedQueue =
        typeof request.query.assignedQueue === 'string'
          ? request.query.assignedQueue
          : undefined
      const q = typeof request.query.q === 'string' ? request.query.q : undefined

      response.json({
        items: callReviewService.listCalls({ status, intent, assignedQueue, q }),
      })
    })
  )

  router.get(
    '/:id',
    asyncHandler((request, response) => {
      const id = Array.isArray(request.params.id)
        ? request.params.id[0]
        : request.params.id
      if (!id) {
        throw new HttpError(400, 'Call id is required.')
      }

      const detail = callReviewService.getCallDetail(id)
      response.json({
        ...detail,
        recordingUrl: detail.call.recordingPath
          ? `/api/calls/${detail.call.id}/recording`
          : null,
      })
    })
  )

  router.get(
    '/:id/recording',
    asyncHandler((request, response) => {
      const id = Array.isArray(request.params.id)
        ? request.params.id[0]
        : request.params.id
      if (!id) {
        throw new HttpError(400, 'Call id is required.')
      }

      const detail = callReviewService.getCallDetail(id)
      if (!detail.call.recordingPath) {
        throw new HttpError(404, 'Recording not found.')
      }

      const absolutePath = path.resolve(config.dataDir, detail.call.recordingPath)
      if (!absolutePath.startsWith(config.recordingsDir)) {
        throw new HttpError(400, 'Invalid recording path.')
      }

      response.type(detail.call.recordingMimeType ?? 'audio/wav')
      response.sendFile(absolutePath)
    })
  )

  router.patch(
    '/:id',
    asyncHandler((request, response) => {
      const id = Array.isArray(request.params.id)
        ? request.params.id[0]
        : request.params.id
      if (!id) {
        throw new HttpError(400, 'Call id is required.')
      }

      const input = parseBody(CallUpdateInputSchema, request.body)
      const call = callReviewService.updateCall(id, input)
      response.json({ call })
    })
  )

  router.post(
    '/:id/notes',
    asyncHandler((request, response) => {
      const id = Array.isArray(request.params.id)
        ? request.params.id[0]
        : request.params.id
      if (!id) {
        throw new HttpError(400, 'Call id is required.')
      }

      const input = parseBody(CreateCallNoteInputSchema, request.body)
      const note = callReviewService.addNote(id, input)
      response.status(201).json({ note })
    })
  )

  return router
}
