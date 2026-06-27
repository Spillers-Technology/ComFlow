import fs from 'node:fs'
import Database from 'better-sqlite3'
import { config } from '../config.js'

fs.mkdirSync(config.recordingsDir, { recursive: true })
fs.mkdirSync(config.rawRecordingsDir, { recursive: true })
fs.mkdirSync(config.greetingsDir, { recursive: true })
fs.mkdirSync(config.outboundAudioDir, { recursive: true })
fs.mkdirSync(config.promptsDir, { recursive: true })

export const db = new Database(config.databasePath)

db.pragma('journal_mode = WAL')

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

  CREATE TABLE IF NOT EXISTS mailboxes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    number TEXT,
    greeting_prompt_id TEXT,
    sip_account_ref TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
  CREATE INDEX IF NOT EXISTS idx_calls_intent ON calls(intent);
  CREATE INDEX IF NOT EXISTS idx_calls_assigned_queue ON calls(assigned_queue);
  CREATE INDEX IF NOT EXISTS idx_call_notes_call_id_created_at ON call_notes(call_id, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_scheduled_calls_status_due ON scheduled_calls(status, scheduled_at ASC);
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
