import path from 'node:path'
import { Response, Router } from 'express'
import {
  CallIntentSchema,
  CallStatusSchema,
  CallUpdateInputSchema,
  CreateCallNoteInputSchema,
  User,
} from '../../../shared/src/index.js'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { CallReviewService } from '../services/callReviewService.js'

function isWithinDirectory(filePath: string, directory: string) {
  const resolvedFile = path.resolve(filePath)
  const resolvedDirectory = path.resolve(directory)
  return (
    resolvedFile === resolvedDirectory ||
    resolvedFile.startsWith(`${resolvedDirectory}${path.sep}`)
  )
}

function recordingFilename(id: string, recordingPath: string) {
  const extension = path.extname(recordingPath) || '.wav'
  return `comflow-voicemail-${id}${extension}`
}

export function createCallsRouter(callReviewService: CallReviewService) {
  const router = Router()

  function sendRecording(
    id: string,
    response: Response,
    options: { download: boolean }
  ) {
    const detail = callReviewService.getCallDetail(
      id,
      response.locals.user as User
    )
    if (!detail.call.recordingPath) {
      throw new HttpError(404, 'Recording not found.')
    }

    const absolutePath = path.resolve(config.dataDir, detail.call.recordingPath)
    if (!isWithinDirectory(absolutePath, config.recordingsDir)) {
      throw new HttpError(400, 'Invalid recording path.')
    }

    response.type(detail.call.recordingMimeType ?? 'audio/wav')
    if (options.download) {
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${recordingFilename(id, detail.call.recordingPath)}"`
      )
    }
    response.sendFile(absolutePath)
  }

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
        items: callReviewService.listCalls(
          { status, intent, assignedQueue, q },
          response.locals.user as User
        ),
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

      const detail = callReviewService.getCallDetail(
        id,
        response.locals.user as User
      )
      response.json({
        ...detail,
        recordingUrl: detail.call.recordingPath
          ? `/api/calls/${detail.call.id}/recording`
          : null,
        recordingDownloadUrl: detail.call.recordingPath
          ? `/api/calls/${detail.call.id}/recording/download`
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

      sendRecording(id, response, { download: false })
    })
  )

  router.get(
    '/:id/recording/download',
    asyncHandler((request, response) => {
      const id = Array.isArray(request.params.id)
        ? request.params.id[0]
        : request.params.id
      if (!id) {
        throw new HttpError(400, 'Call id is required.')
      }

      sendRecording(id, response, { download: true })
    })
  )

  router.patch(
    '/:id',
    asyncHandler(async (request, response) => {
      const id = Array.isArray(request.params.id)
        ? request.params.id[0]
        : request.params.id
      if (!id) {
        throw new HttpError(400, 'Call id is required.')
      }

      const input = parseBody(CallUpdateInputSchema, request.body)
      const call = await callReviewService.updateCall(
        id,
        input,
        response.locals.user as User
      )
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
      const note = callReviewService.addNote(
        id,
        input,
        response.locals.user as User
      )
      response.status(201).json({ note })
    })
  )

  return router
}
