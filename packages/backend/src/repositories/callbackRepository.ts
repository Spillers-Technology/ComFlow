import { CallbackProviderSnapshotSchema } from '../../../shared/src/index.js'
import { db } from '../db/client.js'

export type CallbackAttemptRecord = {
  id: string
  callId: string
  callbackNumber: string
  notes: string | null
  script: string
  status: 'queued' | 'simulated_completed' | 'failed'
  providerSnapshot: {
    llm: {
      provider: 'fake' | 'openai' | 'anthropic'
      model: string | null
    }
    tts: {
      provider: 'fake' | 'openai' | 'elevenlabs'
      model: string | null
      voice: string | null
    }
    telephonyProvider: 'fake'
  }
  providerCallId: string | null
  audioPath: string | null
  audioMimeType: string | null
  createdAt: string
  updatedAt: string
}

type CallbackAttemptRow = {
  id: string
  call_id: string
  callback_number: string
  notes: string | null
  script: string
  status: CallbackAttemptRecord['status']
  provider_snapshot: string
  provider_call_id: string | null
  audio_path: string | null
  audio_mime_type: string | null
  created_at: string
  updated_at: string
}

function mapAttempt(row: CallbackAttemptRow): CallbackAttemptRecord {
  return {
    id: row.id,
    callId: row.call_id,
    callbackNumber: row.callback_number,
    notes: row.notes,
    script: row.script,
    status: row.status,
    providerSnapshot: CallbackProviderSnapshotSchema.parse(
      JSON.parse(row.provider_snapshot)
    ),
    providerCallId: row.provider_call_id,
    audioPath: row.audio_path,
    audioMimeType: row.audio_mime_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const callbackRepository = {
  listByCallId(callId: string): CallbackAttemptRecord[] {
    const rows = db
      .prepare(
        'SELECT * FROM callback_attempts WHERE call_id = ? ORDER BY datetime(created_at) DESC'
      )
      .all(callId) as CallbackAttemptRow[]

    return rows.map(mapAttempt)
  },

  getById(id: string): CallbackAttemptRecord | null {
    const row = db
      .prepare('SELECT * FROM callback_attempts WHERE id = ?')
      .get(id) as CallbackAttemptRow | undefined

    return row ? mapAttempt(row) : null
  },

  create(input: CallbackAttemptRecord): CallbackAttemptRecord {
    db.prepare(`
      INSERT INTO callback_attempts (
        id, call_id, callback_number, notes, script, status,
        provider_snapshot, provider_call_id, audio_path, audio_mime_type,
        created_at, updated_at
      )
      VALUES (
        @id, @call_id, @callback_number, @notes, @script, @status,
        @provider_snapshot, @provider_call_id, @audio_path, @audio_mime_type,
        @created_at, @updated_at
      )
    `).run({
      id: input.id,
      call_id: input.callId,
      callback_number: input.callbackNumber,
      notes: input.notes,
      script: input.script,
      status: input.status,
      provider_snapshot: JSON.stringify(input.providerSnapshot),
      provider_call_id: input.providerCallId,
      audio_path: input.audioPath,
      audio_mime_type: input.audioMimeType,
      created_at: input.createdAt,
      updated_at: input.updatedAt,
    })

    return input
  },
}
