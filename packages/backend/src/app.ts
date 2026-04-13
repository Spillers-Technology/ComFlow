import cors from 'cors'
import express, { NextFunction, Request, Response } from 'express'
import { createCallsRouter } from './routes/calls.js'
import { createHealthRouter } from './routes/health.js'
import { createWebhookRouter } from './routes/webhooks.js'
import { config } from './config.js'
import { HttpError } from './lib/errors.js'
import { FakeTranscriptExtractionProvider } from './providers/extractor/fake.js'
import { LlmTranscriptExtractionProvider } from './providers/extractor/llm.js'
import { FakeSpeechToTextProvider } from './providers/stt/fake.js'
import { FakeTelephonyProvider } from './providers/telephony/fake.js'
import { seedFakeData } from './seed/fakeData.js'
import { CallIngestionService } from './services/callIngestionService.js'
import { CallReviewService } from './services/callReviewService.js'
import { ExtractionService } from './services/extractionService.js'
import { TranscriptionService } from './services/transcriptionService.js'

export function createApp() {
  const app = express()
  const telephonyProvider = new FakeTelephonyProvider()
  const transcriptionService = new TranscriptionService(
    new FakeSpeechToTextProvider()
  )
  const extractionProvider =
    config.mode === 'real' && config.anthropicApiKey
      ? new LlmTranscriptExtractionProvider(config.anthropicApiKey)
      : new FakeTranscriptExtractionProvider()
  const extractionService = new ExtractionService(extractionProvider)
  const callIngestionService = new CallIngestionService(
    transcriptionService,
    extractionService
  )
  const callReviewService = new CallReviewService()

  if (config.mode === 'fake' && config.seedDemo) {
    seedFakeData()
  }

  app.use(
    cors({
      origin: config.frontendOrigin,
    })
  )
  app.use(express.json({ limit: '10mb' }))

  app.use('/api/health', createHealthRouter())
  app.use('/api/calls', createCallsRouter(callReviewService))
  app.use(
    '/api/webhooks',
    createWebhookRouter(telephonyProvider, callIngestionService)
  )

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction
    ) => {
      if (error instanceof HttpError) {
        response.status(error.statusCode).json({ error: error.message })
        return
      }

      if (error instanceof Error) {
        response.status(500).json({ error: error.message })
        return
      }

      response.status(500).json({ error: 'Unknown server error.' })
    }
  )

  return app
}
