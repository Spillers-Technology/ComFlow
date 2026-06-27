import path from 'node:path'
import {
  EngineSettingsSchema,
  LlmProviderSchema,
  SttProviderSchema,
  TtsProviderSchema,
} from '../../shared/src/index.js'
import { loadEnvFile } from './lib/envFile.js'

const envFilePath = loadEnvFile()
const packageRoot = process.cwd()
// COMFLOW_DATA_DIR lets the backend and the baresip SIP edge share one volume
// at an identical path, so recording/greeting/outbound paths resolve the same
// in both containers.
const dataDir = process.env.COMFLOW_DATA_DIR?.trim() || path.join(packageRoot, 'data')

function readEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) {
      return value
    }
  }

  return ''
}

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim()
  return value ? value : null
}

function readCsvEnv(name: string) {
  return (
    process.env[name]
      ?.split(',')
      .map(value => value.trim())
      .filter(Boolean) ?? []
  )
}

function readProviderDefault<T extends string>(
  value: string | undefined,
  schema: { safeParse: (input: unknown) => { success: boolean; data?: T } }
) {
  const parsed = schema.safeParse(value?.trim())
  return parsed.success && parsed.data ? parsed.data : 'fake'
}

export const config = {
  envFilePath,
  port: Number(process.env.PORT ?? 3001),
  packageRoot,
  dataDir,
  recordingsDir: path.join(dataDir, 'recordings'),
  rawRecordingsDir: path.join(dataDir, 'recordings-raw'),
  greetingsDir: path.join(dataDir, 'greetings'),
  outboundAudioDir: path.join(dataDir, 'outbound'),
  promptsDir: path.join(dataDir, 'prompts'),
  databasePath: path.join(dataDir, 'comflow.db'),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  // When set (the production image sets it), the backend also serves the built
  // frontend from this directory, so one container is the whole app on PORT.
  staticDir: readOptionalEnv('COMFLOW_STATIC_DIR'),
  seedDemo: process.env.COMFLOW_SEED_DEMO !== 'false',
  telephony: {
    // 'baresip' drives a real SIP UA (the SIP edge) over its ctrl_tcp interface.
    // 'fake' keeps the webhook-only path used for local dev and tests.
    mode: process.env.COMFLOW_TELEPHONY === 'baresip' ? 'baresip' : 'fake',
    baresipCtrlHost: process.env.BARESIP_CTRL_HOST ?? '127.0.0.1',
    baresipCtrlPort: Number(process.env.BARESIP_CTRL_PORT ?? 4444),
    // WAV played to inbound callers before recording their voicemail.
    greetingPath: readOptionalEnv('COMFLOW_GREETING_PATH'),
    // SIP domain used to build outbound dial URIs (sip:<number>@<domain>).
    // When empty, the raw number is dialed via baresip's default account.
    sipOutboundDomain: readOptionalEnv('COMFLOW_SIP_OUTBOUND_DOMAIN'),
    // Seconds to wait for an outbound call to be answered before giving up.
    outboundAnswerTimeoutSec: Number(
      process.env.COMFLOW_OUTBOUND_ANSWER_TIMEOUT_SEC ?? 45
    ),
    // Seconds to keep an answered outbound call up to capture the reply
    // (after the message + question audio is played).
    outboundCaptureWindowSec: Number(
      process.env.COMFLOW_OUTBOUND_CAPTURE_WINDOW_SEC ?? 20
    ),
    // How often the scheduler checks for due outbound calls, in seconds.
    schedulerIntervalSec: Number(
      process.env.COMFLOW_SCHEDULER_INTERVAL_SEC ?? 15
    ),
  },
  secrets: {
    openaiApiKey: readEnv('COMFLOW_OPENAI_API_KEY', 'OPENAI_API_KEY'),
    anthropicApiKey: readEnv('COMFLOW_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY'),
    elevenLabsApiKey: readEnv(
      'COMFLOW_ELEVENLABS_API_KEY',
      'ELEVENLABS_API_KEY'
    ),
  },
  anchordesk: {
    // Push reviewed ("gilded") voicemails into AnchorDesk as tickets.
    syncEnabled: process.env.ANCHORDESK_SYNC_ENABLED === 'true',
    baseUrl: readOptionalEnv('ANCHORDESK_BASE_URL'),
    apiToken: readEnv('ANCHORDESK_API_TOKEN'),
  },
  email: {
    notificationsEnabled:
      process.env.COMFLOW_EMAIL_NOTIFICATIONS_ENABLED === 'true',
    smtpHost: readOptionalEnv('COMFLOW_SMTP_HOST') ?? '127.0.0.1',
    smtpPort: Number(process.env.COMFLOW_SMTP_PORT ?? 25),
    smtpSecure: process.env.COMFLOW_SMTP_SECURE === 'true',
    smtpUser: readOptionalEnv('COMFLOW_SMTP_USER'),
    smtpPassword: readOptionalEnv('COMFLOW_SMTP_PASSWORD'),
    from:
      readOptionalEnv('COMFLOW_NOTIFICATION_EMAIL_FROM') ??
      'ComFlow <comflow@localhost>',
    to: readCsvEnv('COMFLOW_NOTIFICATION_EMAIL_TO'),
    publicUrl:
      readOptionalEnv('COMFLOW_PUBLIC_URL') ??
      process.env.FRONTEND_ORIGIN ??
      'http://localhost:5173',
    attachRecording:
      process.env.COMFLOW_NOTIFICATION_ATTACH_RECORDING === 'true',
  },
  auth: {
    // Local accounts are first-class. When false (default), the API is open and
    // a default admin identity is assumed — keeps dev/tests friction-free. Set
    // true to enforce login. SSO (OIDC/SAML) slots in behind the same provider
    // interface later (M2). Mirrors AnchorDesk's AUTH_* env shape.
    required: process.env.COMFLOW_AUTH_REQUIRED === 'true',
    sessionSecret: readEnv('COMFLOW_AUTH_SESSION_SECRET') || 'comflow-dev-secret',
    bootstrapAdminEmail: readOptionalEnv('COMFLOW_BOOTSTRAP_ADMIN_EMAIL'),
    bootstrapAdminPassword: readOptionalEnv('COMFLOW_BOOTSTRAP_ADMIN_PASSWORD'),
    sessionTtlHours: Number(process.env.COMFLOW_AUTH_SESSION_TTL_HOURS ?? 720),
  },
  defaultMailbox: {
    name: readOptionalEnv('COMFLOW_DEFAULT_MAILBOX_NAME') ?? 'Main mailbox',
    number: readOptionalEnv('COMFLOW_DEFAULT_MAILBOX_NUMBER'),
    sipAccountRef: readOptionalEnv('COMFLOW_DEFAULT_MAILBOX_SIP_ACCOUNT_REF'),
  },
  defaultEngineSettings: EngineSettingsSchema.parse({
    llm: {
      provider: readProviderDefault(
        process.env.COMFLOW_DEFAULT_LLM_PROVIDER,
        LlmProviderSchema
      ),
      model: readOptionalEnv('COMFLOW_DEFAULT_LLM_MODEL'),
    },
    stt: {
      provider: readProviderDefault(
        process.env.COMFLOW_DEFAULT_STT_PROVIDER,
        SttProviderSchema
      ),
      model: readOptionalEnv('COMFLOW_DEFAULT_STT_MODEL'),
    },
    tts: {
      provider: readProviderDefault(
        process.env.COMFLOW_DEFAULT_TTS_PROVIDER,
        TtsProviderSchema
      ),
      model: readOptionalEnv('COMFLOW_DEFAULT_TTS_MODEL'),
      voice: readOptionalEnv('COMFLOW_DEFAULT_TTS_VOICE'),
    },
  }),
}
