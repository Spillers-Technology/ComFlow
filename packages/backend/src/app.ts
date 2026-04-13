import cors from 'cors'
import express, { NextFunction, Request, Response } from 'express'
import { createCallbacksRouter } from './routes/callbacks.js'
import { createCallsRouter } from './routes/calls.js'
import { createHealthRouter } from './routes/health.js'
import { createSettingsRouter } from './routes/settings.js'
import { createWebhookRouter } from './routes/webhooks.js'
import { config } from './config.js'
import { HttpError } from './lib/errors.js'
import { FakeTelephonyProvider } from './providers/telephony/fake.js'
import { seedFakeData } from './seed/fakeData.js'
import { CallbackService } from './services/callbackService.js'
import { CallIngestionService } from './services/callIngestionService.js'
import { CallReviewService } from './services/callReviewService.js'
import { EngineService } from './services/engineService.js'

export function createApp() {
  const app = express()
  const telephonyProvider = new FakeTelephonyProvider()
  const engineService = new EngineService()
  const callIngestionService = new CallIngestionService(engineService)
  const callReviewService = new CallReviewService()
  const callbackService = new CallbackService(engineService, telephonyProvider)

  if (config.seedDemo) {
    seedFakeData()
  }

  app.use(
    cors({
      origin: config.frontendOrigin,
    })
  )
  app.use(express.json({ limit: '10mb' }))

  app.use('/api/health', createHealthRouter(engineService))
  app.use('/api/settings', createSettingsRouter(engineService))
  app.use('/api/callbacks', createCallbacksRouter(callbackService))
  app.use('/api/calls', createCallsRouter(callReviewService, callbackService))
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
      void _next

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
