import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { config } from '../config.js'

fs.mkdirSync(config.recordingsDir, { recursive: true })
fs.mkdirSync(config.rawRecordingsDir, { recursive: true })
fs.mkdirSync(config.greetingsDir, { recursive: true })
fs.mkdirSync(config.outboundAudioDir, { recursive: true })
fs.mkdirSync(config.promptsDir, { recursive: true })

export const db = new Database(config.databasePath)

db.pragma('journal_mode = WAL')
// Enforce foreign keys so RBAC cascade deletes (e.g. removing a group clears its
// memberships and mailbox grants) actually fire.
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    telephony_call_id TEXT UNIQUE,
    source TEXT NOT NULL,
    caller_name TEXT,
    company TEXT,
    callback_number TEXT,
    intent TEXT NOT NULL,
    urgency TEXT NOT NULL,
    summary TEXT,
    transcript TEXT,
    raw_transcript TEXT,
    status TEXT NOT NULL,
    assigned_queue TEXT,
    recording_status TEXT NOT NULL,
    recording_path TEXT,
    recording_mime_type TEXT,
    reviewed_at TEXT,
    synced_ticket_id TEXT,
    synced_ticket_provider TEXT,
    synced_at TEXT,
    email_notified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS call_notes (
    id TEXT PRIMARY KEY,
    call_id TEXT NOT NULL,
    body TEXT NOT NULL,
    author_name TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS engine_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    llm_provider TEXT NOT NULL,
    llm_model TEXT,
    stt_provider TEXT NOT NULL,
    stt_model TEXT,
    tts_provider TEXT NOT NULL,
    tts_model TEXT,
    tts_voice TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS engine_secret_overrides (
    secret_key TEXT PRIMARY KEY,
    secret_value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sip_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL,
    account_label TEXT NOT NULL,
    account_uri TEXT,
    auth_username TEXT,
    outbound_proxy TEXT,
    outbound_dialing_domain TEXT,
    registration_interval INTEGER NOT NULL,
    preferred_codecs_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scheduled_calls (
    id TEXT PRIMARY KEY,
    to_number TEXT NOT NULL,
    scheduled_at TEXT NOT NULL,
    message_text TEXT NOT NULL,
    question_text TEXT NOT NULL,
    message_prompt_id TEXT,
    question_prompt_id TEXT,
    status TEXT NOT NULL,
    answer_transcript TEXT,
    answer_recording_path TEXT,
    provider_call_id TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audio_prompts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    audio_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    password_hash TEXT,
    role TEXT NOT NULL,
    auth_provider TEXT NOT NULL DEFAULT 'local',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS mailboxes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    number TEXT,
    greeting_prompt_id TEXT,
    sip_account_ref TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Multi-tenancy (3.0): a tenant is a customer org (or a single paid user). The
  -- platform owner sees all tenants; an org-admin/member is scoped to exactly one.
  -- Every customer-owned row carries tenant_id so isolation is enforced in queries,
  -- not by convention.
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- DIDs ordered from a SIP trunk provider (VoIP.ms), routed to our shared
  -- trunk and bound to a tenant's mailbox. The mailbox number column holds the
  -- DID; this table tracks provisioning lifecycle + pricing for billing/release.
  CREATE TABLE IF NOT EXISTS provisioned_dids (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    number TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    monthly_cents INTEGER NOT NULL DEFAULT 0,
    per_minute_cents INTEGER NOT NULL DEFAULT 0,
    mailbox_id TEXT,
    created_at TEXT NOT NULL,
    released_at TEXT
  );

  -- Usage metering (3.0): one row per billable unit consumed by a tenant.
  -- unit_cost_cents is the raw carrier/AI cost; billed_cents is what the tenant
  -- is charged (carrier cost x the tenant's markup). Aggregated for the wallet
  -- and the transparent usage breakdown.
  CREATE TABLE IF NOT EXISTS usage_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    type TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_cost_cents REAL NOT NULL,
    billed_cents INTEGER NOT NULL,
    call_id TEXT,
    created_at TEXT NOT NULL
  );

  -- Prepaid wallet per tenant. credit_cents is the running total funded via
  -- Stripe (top-ups + subscription credits); the available balance is
  -- credit_cents minus aggregated usage_events.billed_cents.
  CREATE TABLE IF NOT EXISTS tenant_billing (
    tenant_id TEXT PRIMARY KEY,
    stripe_customer_id TEXT,
    subscription_id TEXT,
    plan TEXT,
    credit_cents INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  -- Idempotency guard so a replayed Stripe webhook can't double-credit a wallet.
  CREATE TABLE IF NOT EXISTS billing_events (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );

  -- Per-tenant limits + pricing. markup_bps is basis points over carrier cost
  -- (15000 = 1.5x). A row is created lazily from config defaults.
  CREATE TABLE IF NOT EXISTS tenant_limits (
    tenant_id TEXT PRIMARY KEY,
    max_concurrent_calls INTEGER NOT NULL,
    max_dids INTEGER NOT NULL,
    included_minutes INTEGER NOT NULL,
    markup_bps INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- RBAC (M3): groups grant mailbox visibility. Admins see everything; members
  -- see only the mailboxes their groups grant.
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS group_mailboxes (
    group_id TEXT NOT NULL,
    mailbox_id TEXT NOT NULL,
    PRIMARY KEY (group_id, mailbox_id),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id) ON DELETE CASCADE
  );

  -- Maps an IdP group name (from an SSO assertion) onto a ComFlow group, so
  -- membership can be synced on every SSO login.
  CREATE TABLE IF NOT EXISTS sso_group_mappings (
    external_name TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  );

  -- Transient CSRF/nonce store for the SSO redirect round-trip. Rows are
  -- consumed (deleted) on callback; stale rows are swept by age.
  CREATE TABLE IF NOT EXISTS sso_login_states (
    state TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    nonce TEXT,
    code_verifier TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
  CREATE INDEX IF NOT EXISTS idx_calls_intent ON calls(intent);
  CREATE INDEX IF NOT EXISTS idx_calls_assigned_queue ON calls(assigned_queue);
  CREATE INDEX IF NOT EXISTS idx_call_notes_call_id_created_at ON call_notes(call_id, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_scheduled_calls_status_due ON scheduled_calls(status, scheduled_at ASC);
  CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
  CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
`)

// Lightweight migrations for databases created before a column existed.
function addColumnIfMissing(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string
  }[]
  if (!columns.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

addColumnIfMissing('calls', 'synced_ticket_id', 'TEXT')
addColumnIfMissing('calls', 'synced_ticket_provider', 'TEXT')
addColumnIfMissing('calls', 'synced_at', 'TEXT')
addColumnIfMissing('scheduled_calls', 'message_prompt_id', 'TEXT')
addColumnIfMissing('scheduled_calls', 'question_prompt_id', 'TEXT')
addColumnIfMissing('calls', 'mailbox_id', 'TEXT')
addColumnIfMissing('calls', 'email_notified_at', 'TEXT')
// Snapshot of the operator who reviewed/assigned the call (display name or email).
addColumnIfMissing('calls', 'reviewed_by', 'TEXT')
// Links a local user row to an external SSO identity (subject/nameID).
addColumnIfMissing('users', 'external_id', 'TEXT')
// Email verification (4.0 self-registration). Operator-created, SSO, and
// bootstrap accounts are verified at creation; only self-registered accounts
// start unverified, holding a token until the emailed link is clicked.
addColumnIfMissing('users', 'email_verified_at', 'TEXT')
addColumnIfMissing('users', 'email_verification_token', 'TEXT')
addColumnIfMissing('users', 'email_verification_expires_at', 'TEXT')
addColumnIfMissing('users', 'self_registered_at', 'TEXT')
addColumnIfMissing(
  'tenant_billing',
  'pending_topup_cents',
  'INTEGER NOT NULL DEFAULT 0'
)
addColumnIfMissing('tenant_billing', 'pending_topup_expires_at', 'TEXT')
// Backfill pre-4.0 rows as verified. Unverified self-registered rows always
// carry a token, so the token guard keeps them out of this backfill.
db.prepare(`
  UPDATE users SET email_verified_at = updated_at
  WHERE email_verified_at IS NULL AND email_verification_token IS NULL
`).run()
// The application has always compared email addresses case-insensitively. Make
// that invariant authoritative in SQLite so two app processes cannot race a
// case-variant duplicate registration.
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
    ON users(lower(email));
`)

// Audit trail (4.0): privileged/automated actions — self-registration, DID
// provision/release, wallet credits, tenant freeze/unfreeze — leave a row here
// so hosted-mode changes are attributable after the fact.
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    tenant_id TEXT,
    detail TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_tenant_created
    ON audit_log(tenant_id, created_at DESC);

  -- Holds a DID slot while the provider order is in flight. Counting active
  -- DIDs plus these reservations makes plan caps safe across async requests.
  CREATE TABLE IF NOT EXISTS did_provisioning_reservations (
    number TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_did_reservations_tenant
    ON did_provisioning_reservations(tenant_id);

  -- A dispute freeze and its owner notification are one durable workflow. The
  -- freeze/audit/event marker and this row are committed together; SMTP retries
  -- update this row without replaying the financial mutation.
  CREATE TABLE IF NOT EXISTS billing_alert_outbox (
    event_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    tenant_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    sent_at TEXT
  );
`)

// Multi-tenancy (3.0): every customer-owned table gets a tenant_id. Added as a
// nullable column first so existing databases migrate cleanly, then backfilled
// onto a single "primary" tenant below.
const TENANT_SCOPED_TABLES = [
  'users',
  'mailboxes',
  'calls',
  'groups',
  'api_keys',
  'scheduled_calls',
  'audio_prompts',
] as const

for (const table of TENANT_SCOPED_TABLES) {
  addColumnIfMissing(table, 'tenant_id', 'TEXT')
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_calls_tenant ON calls(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_mailboxes_tenant ON mailboxes(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_usage_tenant_created ON usage_events(tenant_id, created_at);
`)

/**
 * Ensure a single "primary" tenant exists and that every pre-tenancy row is
 * attributed to it. Idempotent: safe to run on every boot. Returns the primary
 * tenant id so bootstrap (config/app) can attach the first admin + mailbox.
 */
export function ensurePrimaryTenant(defaults: {
  name: string
  slug: string
}): string {
  const existing = db
    .prepare('SELECT id FROM tenants ORDER BY datetime(created_at) ASC LIMIT 1')
    .get() as { id: string } | undefined

  let tenantId = existing?.id
  if (!tenantId) {
    const now = new Date().toISOString()
    tenantId = randomUUID()
    db.prepare(`
      INSERT INTO tenants (id, name, slug, plan, status, created_at, updated_at)
      VALUES (@id, @name, @slug, 'free', 'active', @now, @now)
    `).run({ id: tenantId, name: defaults.name, slug: defaults.slug, now })
  }

  for (const table of TENANT_SCOPED_TABLES) {
    db.prepare(
      `UPDATE ${table} SET tenant_id = ? WHERE tenant_id IS NULL`
    ).run(tenantId)
  }

  return tenantId
}
