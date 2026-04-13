import fs from 'node:fs'
import Database from 'better-sqlite3'
import { config } from '../config.js'

fs.mkdirSync(config.recordingsDir, { recursive: true })
fs.mkdirSync(config.callbackAudioDir, { recursive: true })

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

  CREATE TABLE IF NOT EXISTS callback_attempts (
    id TEXT PRIMARY KEY,
    call_id TEXT NOT NULL,
    callback_number TEXT NOT NULL,
    notes TEXT,
    script TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_snapshot TEXT NOT NULL,
    provider_call_id TEXT,
    audio_path TEXT,
    audio_mime_type TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
  CREATE INDEX IF NOT EXISTS idx_calls_intent ON calls(intent);
  CREATE INDEX IF NOT EXISTS idx_calls_assigned_queue ON calls(assigned_queue);
  CREATE INDEX IF NOT EXISTS idx_call_notes_call_id_created_at ON call_notes(call_id, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_callback_attempts_call_id_created_at ON callback_attempts(call_id, created_at DESC);
`)
