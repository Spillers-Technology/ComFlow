import { Router } from 'express'
import { asyncHandler } from '../lib/http.js'
import { TelephonyProvider } from '../providers/telephony/types.js'
import { CallIngestionService } from '../services/callIngestionService.js'

export function createWebhookRouter(
  telephonyProvider: TelephonyProvider,
  callIngestionService: CallIngestionService
) {
  const router = Router()

  router.post(
    '/telephony/inbound',
    asyncHandler(async (request, response) => {
      const input = telephonyProvider.normalizeInbound(request.body)
      const call = await callIngestionService.createInboundCall(input)
      response.status(202).json({
        callId: call.id,
        accepted: true,
      })
    })
  )

  router.post(
    '/telephony/recording-complete',
    asyncHandler(async (request, response) => {
      const input = telephonyProvider.normalizeRecordingComplete(request.body)
      const call = await callIngestionService.processRecordingComplete(input)
      response.status(202).json({
        callId: call.id,
        processed: true,
      })
    })
  )

  return router
}
