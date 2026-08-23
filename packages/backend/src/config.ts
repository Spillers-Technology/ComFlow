import path from 'node:path'
import {
  EngineSettingsSchema,
  LlmProviderSchema,
  SipSettingsSchema,
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

/**
 * Fallback session-signing secret for dev and self-host open mode. Hosted mode
 * refuses to boot on this value — see registrationService.assertConfiguration.
 */
export const DEV_SESSION_SECRET = 'comflow-dev-secret'

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
  // Required behind a trusted ingress so request.ip reflects the client for
  // public-endpoint rate limits. Leave off when clients connect directly.
  trustProxy: process.env.COMFLOW_TRUST_PROXY === 'true',
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
    baresipAccountsPath:
      readOptionalEnv('BARESIP_ACCOUNTS_PATH') ??
      path.join(dataDir, 'baresip', 'accounts'),
    baresipRestartUrl:
      readOptionalEnv('COMFLOW_BARESIP_RESTART_URL') ??
      readOptionalEnv('BARESIP_RESTART_URL'),
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
    // Hard stop for an inbound voicemail so one caller cannot hold a paid SIP
    // channel indefinitely after the wallet check at call start.
    inboundMaxDurationSec: Number(
      process.env.COMFLOW_INBOUND_MAX_DURATION_SEC ?? 180
    ),
    // How often the scheduler checks for due outbound calls, in seconds.
    schedulerIntervalSec: Number(
      process.env.COMFLOW_SCHEDULER_INTERVAL_SEC ?? 15
    ),
  },
  // SIP trunk provider for on-the-fly DID provisioning. When VoIP.ms creds are
  // present the real adapter is used; otherwise a `fake` in-memory pool backs
  // dev/tests. One shared account serves all tenants.
  sipTrunk: {
    provider: readOptionalEnv('COMFLOW_SIP_TRUNK_PROVIDER'),
    voipms: {
      apiUsername: readOptionalEnv('VOIPMS_API_USERNAME'),
      apiPassword: readOptionalEnv('VOIPMS_API_PASSWORD'),
      subAccount: readOptionalEnv('VOIPMS_SUBACCOUNT') ?? '',
      defaultState: readOptionalEnv('VOIPMS_DEFAULT_STATE') ?? 'NY',
      defaultMonthlyCents: Number(process.env.VOIPMS_DEFAULT_MONTHLY_CENTS ?? 85),
      defaultPerMinuteCents: Number(
        process.env.VOIPMS_DEFAULT_PER_MINUTE_CENTS ?? 1
      ),
    },
  },
  // Stripe wallet billing. When a secret key is present the real adapter is
  // used; otherwise a `fake` adapter backs dev/tests (no network, no signatures).
  billing: {
    provider: readOptionalEnv('COMFLOW_BILLING_PROVIDER'),
    // Real billing always enforces the wallet. Paid plans also enforce it when
    // the fake provider is selected so hosted dry-runs exercise the same fraud
    // boundary instead of silently provisioning at $0.
    enforced:
      process.env.COMFLOW_BILLING_ENFORCED === 'true' ||
      readOptionalEnv('COMFLOW_BILLING_PROVIDER') === 'stripe' ||
      Boolean(readOptionalEnv('STRIPE_SECRET_KEY')),
    stripeSecretKey: readOptionalEnv('STRIPE_SECRET_KEY'),
    stripeWebhookSecret: readOptionalEnv('STRIPE_WEBHOOK_SECRET'),
    // Bound the amount of provider spend a single disputed top-up can unlock.
    // Hosted operators may lower this further; the service enforces it even if
    // a caller bypasses the frontend's suggested amounts.
    maxTopUpCents: Number(process.env.COMFLOW_MAX_TOPUP_CENTS ?? 10000),
    // Where Stripe Checkout returns the customer after pay/cancel.
    successUrl:
      readOptionalEnv('STRIPE_SUCCESS_URL') ??
      `${process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'}/billing?status=success`,
    cancelUrl:
      readOptionalEnv('STRIPE_CANCEL_URL') ??
      `${process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'}/billing?status=cancel`,
    // Stripe Price ids per purchasable band. They differ between test and live
    // mode, so they are environment config rather than part of PLAN_CATALOG.
    // Create the Products/Prices once in the Stripe dashboard and record them.
    priceIds: {
      solo: readOptionalEnv('COMFLOW_STRIPE_PRICE_SOLO'),
      pro: readOptionalEnv('COMFLOW_STRIPE_PRICE_PRO'),
      business: readOptionalEnv('COMFLOW_STRIPE_PRICE_BUSINESS'),
    } as Record<string, string | undefined>,
  },
  secrets: {
    openaiApiKey: readEnv('COMFLOW_OPENAI_API_KEY', 'OPENAI_API_KEY'),
    anthropicApiKey: readEnv('COMFLOW_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY'),
    elevenLabsApiKey: readEnv(
      'COMFLOW_ELEVENLABS_API_KEY',
      'ELEVENLABS_API_KEY'
    ),
    sipAuthPassword: readEnv('COMFLOW_SIP_AUTH_PASSWORD'),
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
    // true to enforce login. SSO (OIDC/SAML, M2) slots in behind the SsoProvider
    // abstraction. Env names mirror AnchorDesk's AUTH_*/OIDC_*/SAML_* shape, with
    // COMFLOW_* kept as fallbacks for the vars that already shipped.
    required: process.env.COMFLOW_AUTH_REQUIRED === 'true',
    // Set AUTH_LOCAL_ENABLED=false for SSO-only deployments (hides the password
    // form). Defaults on.
    localEnabled: process.env.AUTH_LOCAL_ENABLED !== 'false',
    sessionSecret:
      readEnv('AUTH_SESSION_SECRET', 'COMFLOW_AUTH_SESSION_SECRET') ||
      DEV_SESSION_SECRET,
    // Reset links are short-lived by design — much shorter than the email
    // verification TTL, since a reset link is a full account takeover if leaked.
    passwordResetTtlHours: Number(
      process.env.COMFLOW_PASSWORD_RESET_TTL_HOURS ?? 2
    ),
    bootstrapAdminEmail: readOptionalEnv('COMFLOW_BOOTSTRAP_ADMIN_EMAIL'),
    bootstrapAdminPassword: readOptionalEnv('COMFLOW_BOOTSTRAP_ADMIN_PASSWORD'),
    sessionTtlHours: Number(process.env.COMFLOW_AUTH_SESSION_TTL_HOURS ?? 720),
    // Emails promoted to admin on every SSO login (promotion-only; never demotes).
    adminEmails: readCsvEnv('AUTH_ADMIN_EMAILS').map(value => value.toLowerCase()),
    // Where the backend sends the browser after a successful SSO round-trip; the
    // session token rides in the URL fragment. Defaults to the SPA login route.
    ssoSuccessRedirect:
      readOptionalEnv('COMFLOW_SSO_SUCCESS_REDIRECT') ??
      `${process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'}/login`,
    oidc: {
      issuerUrl: readOptionalEnv('OIDC_ISSUER_URL'),
      clientId: readOptionalEnv('OIDC_CLIENT_ID'),
      clientSecret: readOptionalEnv('OIDC_CLIENT_SECRET'),
      redirectUri: readOptionalEnv('OIDC_REDIRECT_URI'),
      scopes: readEnv('OIDC_SCOPES') || 'openid email profile',
      // ID-token/userinfo claim holding the user's group names.
      groupsClaim: readEnv('OIDC_GROUPS_CLAIM') || 'groups',
      label: readEnv('OIDC_LABEL') || 'Single sign-on',
      // OIDC is on only when fully configured; OIDC_DISABLED=true forces it off.
      get enabled() {
        return (
          process.env.OIDC_DISABLED !== 'true' &&
          Boolean(
            this.issuerUrl && this.clientId && this.clientSecret && this.redirectUri
          )
        )
      },
    },
    saml: {
      entryPoint: readOptionalEnv('SAML_ENTRY_POINT'),
      issuer: readOptionalEnv('SAML_ISSUER'),
      idpCert: readOptionalEnv('SAML_IDP_CERT'),
      callbackUrl: readOptionalEnv('SAML_CALLBACK_URL'),
      groupsAttribute: readEnv('SAML_GROUPS_ATTRIBUTE') || 'groups',
      label: readEnv('SAML_LABEL') || 'SAML sign-on',
      get enabled() {
        return (
          process.env.SAML_DISABLED !== 'true' &&
          Boolean(this.entryPoint && this.issuer && this.idpCert && this.callbackUrl)
        )
      },
    },
  },
  // Self-service signup (hosted mode): a public endpoint creates a tenant with
  // the caller as its org-admin. Off by default; requires COMFLOW_AUTH_REQUIRED
  // so open-mode self-hosts can't be turned into accidental multi-tenant hosts.
  selfRegistration: {
    enabled: process.env.COMFLOW_SELF_REGISTRATION === 'true',
    plan: readOptionalEnv('COMFLOW_SELF_REGISTRATION_PLAN') ?? 'solo',
    // Open signup always verifies ownership of the email address. Deployments
    // that enable registration must also configure the SMTP transport.
    verificationTtlHours: Number(
      process.env.COMFLOW_EMAIL_VERIFICATION_TTL_HOURS ?? 24
    ),
    // The public solo plan has an explicit, finite risk envelope. These values
    // are deliberately separate from operator-created tenant defaults.
    planLimits: {
      maxConcurrentCalls: Number(
        process.env.COMFLOW_SELF_REGISTRATION_MAX_CONCURRENT ?? 2
      ),
      maxDids: Number(process.env.COMFLOW_SELF_REGISTRATION_MAX_DIDS ?? 1),
      includedMinutes: Number(
        process.env.COMFLOW_SELF_REGISTRATION_INCLUDED_MINUTES ?? 200
      ),
      markupBps: Number(
        process.env.COMFLOW_SELF_REGISTRATION_MARKUP_BPS ?? 15000
      ),
    },
    // A self-registered tenant may not unlock more provider spend than this
    // without an operator changing its status/plan. Unlike a wallet-balance
    // cap, lifetime settled credit remains bounded after usage is consumed.
    maxLifetimeCreditCents: Number(
      process.env.COMFLOW_SELF_REGISTRATION_MAX_LIFETIME_CREDIT_CENTS ?? 20000
    ),
  },
  // The "primary" tenant every pre-tenancy row backfills onto, and the home of
  // the bootstrap admin + default mailbox. In self-host/open mode this is the
  // only tenant; in hosted mode the platform owner adds more alongside it.
  defaultTenant: {
    name: readOptionalEnv('COMFLOW_DEFAULT_TENANT_NAME') ?? 'Primary',
    slug: readOptionalEnv('COMFLOW_DEFAULT_TENANT_SLUG') ?? 'primary',
  },
  // Default per-tenant limits + pricing, applied when a tenant has no override.
  // markupBps is basis points over carrier cost (15000 = 1.5x).
  defaultTenantLimits: {
    maxConcurrentCalls: Number(process.env.COMFLOW_DEFAULT_MAX_CONCURRENT ?? 3),
    maxDids: Number(process.env.COMFLOW_DEFAULT_MAX_DIDS ?? 1),
    includedMinutes: Number(process.env.COMFLOW_DEFAULT_INCLUDED_MINUTES ?? 0),
    markupBps: Number(process.env.COMFLOW_DEFAULT_MARKUP_BPS ?? 15000),
  },
  // Outbound calling is the highest-abuse surface: it spends money dialing
  // arbitrary numbers. These ceilings apply on top of the per-tenant opt-in, so
  // even an approved tenant cannot run up an unbounded bill in a day.
  outbound: {
    maxPerDay: Number(process.env.COMFLOW_OUTBOUND_MAX_PER_DAY ?? 50),
    maxSpendPerDayCents: Number(
      process.env.COMFLOW_OUTBOUND_MAX_SPEND_PER_DAY_CENTS ?? 2000
    ),
    // Total call duration ceiling, mirroring COMFLOW_INBOUND_MAX_DURATION_SEC.
    maxDurationSec: Number(
      process.env.COMFLOW_OUTBOUND_MAX_DURATION_SEC ?? 300
    ),
    // E.164 country calling codes that may be dialed. Defaults to NANP (+1),
    // which covers the US and Canada — where the VoIP.ms DIDs live and where
    // per-minute rates are predictable. Premium-rate and international
    // destinations are where toll fraud actually pays, so they stay closed.
    allowedCallingCodes: readCsvEnv('COMFLOW_OUTBOUND_ALLOWED_CODES').length
      ? readCsvEnv('COMFLOW_OUTBOUND_ALLOWED_CODES')
      : ['1'],
  },
  // The whole-trunk concurrent-call ceiling (e.g. a 10-channel SIP trunk).
  trunkConcurrentCallLimit: Number(process.env.COMFLOW_TRUNK_CHANNELS ?? 10),
  // Raw carrier/AI unit costs in cents, used to meter usage. Owner-tunable.
  usageCosts: {
    inboundPerMinuteCents: Number(process.env.COMFLOW_COST_INBOUND_MIN ?? 1),
    outboundPerMinuteCents: Number(process.env.COMFLOW_COST_OUTBOUND_MIN ?? 1),
    sttCents: Number(process.env.COMFLOW_COST_STT ?? 1),
    llmCents: Number(process.env.COMFLOW_COST_LLM ?? 1),
    ttsCents: Number(process.env.COMFLOW_COST_TTS ?? 1),
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
  defaultSipSettings: SipSettingsSchema.parse({
    enabled: (() => {
      const value = process.env.COMFLOW_SIP_ENABLED?.trim()
      if (value === 'true') return true
      if (value === 'false') return false
      return Boolean(readOptionalEnv('COMFLOW_SIP_ACCOUNT_URI'))
    })(),
    accountLabel:
      readOptionalEnv('COMFLOW_SIP_ACCOUNT_LABEL') ??
      readOptionalEnv('COMFLOW_DEFAULT_MAILBOX_SIP_ACCOUNT_REF') ??
      'main',
    accountUri: readOptionalEnv('COMFLOW_SIP_ACCOUNT_URI'),
    authUsername: readOptionalEnv('COMFLOW_SIP_AUTH_USERNAME'),
    outboundProxy: readOptionalEnv('COMFLOW_SIP_OUTBOUND_PROXY'),
    outboundDialingDomain: readOptionalEnv('COMFLOW_SIP_OUTBOUND_DOMAIN'),
    registrationInterval: process.env.COMFLOW_SIP_REGISTRATION_INTERVAL,
    preferredCodecs: readCsvEnv('COMFLOW_SIP_PREFERRED_CODECS'),
  }),
}
