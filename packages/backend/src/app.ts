import cors from 'cors'
import express, { NextFunction, Request, Response } from 'express'
import { createAuthRouter } from './routes/auth.js'
import { createCallsRouter } from './routes/calls.js'
import { createHealthRouter } from './routes/health.js'
import { createMailboxesRouter } from './routes/mailboxes.js'
import { createPromptsRouter } from './routes/prompts.js'
import { createScheduledCallsRouter } from './routes/scheduledCalls.js'
import { createSettingsRouter } from './routes/settings.js'
import { createWebhookRouter } from './routes/webhooks.js'
import { config } from './config.js'
import { HttpError } from './lib/errors.js'
import { requireAuth } from './middleware/requireAuth.js'
import { FakeTelephonyProvider } from './providers/telephony/fake.js'
import { seedFakeData } from './seed/fakeData.js'
import { AudioPromptService } from './services/audioPromptService.js'
import { AuthService } from './services/authService.js'
import { CallIngestionService } from './services/callIngestionService.js'
import { CallReviewService } from './services/callReviewService.js'
import { EngineService } from './services/engineService.js'
import { MailboxService } from './services/mailboxService.js'
import { ScheduledCallService } from './services/scheduledCallService.js'
import { TelephonyGatewayService } from './services/telephonyGatewayService.js'

export function createApp() {
  const app = express()
  const telephonyProvider = new FakeTelephonyProvider()
  const engineService = new EngineService()
  const callIngestionService = new CallIngestionService(engineService)
  const callReviewService = new CallReviewService()
  const authService = new AuthService()
  const mailboxService = new MailboxService()
  authService.bootstrap()
  mailboxService.getDefault()

  // Real SIP edge: connect to baresip and drive answer/record/ingest directly.
  // In 'fake' mode the webhook endpoints remain the ingestion path.
  const audioPromptService = new AudioPromptService()
  const telephonyGateway = new TelephonyGatewayService(
    callIngestionService,
    audioPromptService
  )
  const scheduledCallService = new ScheduledCallService(
    engineService,
    telephonyGateway,
    audioPromptService
  )
  if (config.telephony.mode === 'baresip') {
    telephonyGateway.start()
    scheduledCallService.startScheduler()
  }

  if (config.seedDemo) {
    seedFakeData()
  }

  app.use(
    cors({
      origin: config.frontendOrigin,
    })
  )
  app.use(express.json({ limit: '10mb' }))

  // Open endpoints: health, auth, and webhooks (machine-to-machine).
  app.use('/api/health', createHealthRouter(engineService))
  app.use('/api/auth', createAuthRouter(authService))
  app.use(
    '/api/webhooks',
    createWebhookRouter(telephonyProvider, callIngestionService)
  )

  // UI-facing endpoints, guarded by requireAuth (pass-through in open mode).
  app.use('/api/settings', requireAuth, createSettingsRouter(engineService))
  app.use('/api/calls', requireAuth, createCallsRouter(callReviewService))
  app.use('/api/prompts', requireAuth, createPromptsRouter(audioPromptService))
  app.use(
    '/api/scheduled-calls',
    requireAuth,
    createScheduledCallsRouter(scheduledCallService)
  )
  app.use('/api/mailboxes', requireAuth, createMailboxesRouter(mailboxService))

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
