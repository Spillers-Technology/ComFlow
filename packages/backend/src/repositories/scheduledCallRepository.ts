import { randomUUID } from 'node:crypto'
import {
  ScheduledCall,
  ScheduledCallSchema,
  ScheduledCallStatus,
} from '../../../shared/src/index.js'
import { db } from '../db/client.js'

type ScheduledCallRow = {
  id: string
  to_number: string
  scheduled_at: string
  message_text: string
  question_text: string
  message_prompt_id: string | null
  question_prompt_id: string | null
  status: ScheduledCallStatus
  answer_transcript: string | null
  answer_recording_path: string | null
  provider_call_id: string | null
  attempts: number
  last_error: string | null
  created_at: string
  updated_at: string
}

export type ScheduledCallRecord = ScheduledCall & {
  answerRecordingPath: string | null
  providerCallId: string | null
  messagePromptId: string | null
  questionPromptId: string | null
}

function mapRow(row: ScheduledCallRow): ScheduledCallRecord {
  const api = ScheduledCallSchema.parse({
    id: row.id,
    toNumber: row.to_number,
    scheduledAt: row.scheduled_at,
    messageText: row.message_text,
    questionText: row.question_text,
    status: row.status,
    answerTranscript: row.answer_transcript,
    answerRecordingUrl: row.answer_recording_path
      ? `/api/scheduled-calls/${row.id}/answer-audio`
      : null,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })

  return {
    ...api,
    answerRecordingPath: row.answer_recording_path,
    providerCallId: row.provider_call_id,
    messagePromptId: row.message_prompt_id,
    questionPromptId: row.question_prompt_id,
  }
}

export const scheduledCallRepository = {
  create(input: {
    toNumber: string
    scheduledAt: string
    messageText: string
    questionText: string
    messagePromptId: string | null
    questionPromptId: string | null
  }): ScheduledCallRecord {
    const now = new Date().toISOString()
    const row: ScheduledCallRow = {
      id: randomUUID(),
      to_number: input.toNumber,
      scheduled_at: input.scheduledAt,
      message_text: input.messageText,
      question_text: input.questionText,
      message_prompt_id: input.messagePromptId,
      question_prompt_id: input.questionPromptId,
      status: 'scheduled',
      answer_transcript: null,
      answer_recording_path: null,
      provider_call_id: null,
      attempts: 0,
      last_error: null,
      created_at: now,
      updated_at: now,
    }

    db.prepare(`
      INSERT INTO scheduled_calls (
        id, to_number, scheduled_at, message_text, question_text,
        message_prompt_id, question_prompt_id, status,
        answer_transcript, answer_recording_path, provider_call_id, attempts,
        last_error, created_at, updated_at
      )
      VALUES (
        @id, @to_number, @scheduled_at, @message_text, @question_text,
        @message_prompt_id, @question_prompt_id, @status,
        @answer_transcript, @answer_recording_path, @provider_call_id, @attempts,
        @last_error, @created_at, @updated_at
      )
    `).run(row)

    return mapRow(row)
  },

  list(): ScheduledCallRecord[] {
    const rows = db
      .prepare('SELECT * FROM scheduled_calls ORDER BY datetime(scheduled_at) DESC')
      .all() as ScheduledCallRow[]
    return rows.map(mapRow)
  },

  getById(id: string): ScheduledCallRecord | null {
    const row = db
      .prepare('SELECT * FROM scheduled_calls WHERE id = ?')
      .get(id) as ScheduledCallRow | undefined
    return row ? mapRow(row) : null
  },

  /** Calls that are due now and still waiting to run. */
  listDue(nowIso: string): ScheduledCallRecord[] {
    const rows = db
      .prepare(
        `SELECT * FROM scheduled_calls
         WHERE status = 'scheduled' AND datetime(scheduled_at) <= datetime(?)
         ORDER BY datetime(scheduled_at) ASC`
      )
      .all(nowIso) as ScheduledCallRow[]
    return rows.map(mapRow)
  },

  update(
    id: string,
    patch: {
      status?: ScheduledCallStatus
      answerTranscript?: string | null
      answerRecordingPath?: string | null
      providerCallId?: string | null
      attempts?: number
      lastError?: string | null
    }
  ): ScheduledCallRecord | null {
    const existing = this.getById(id)
    if (!existing) return null

    db.prepare(`
      UPDATE scheduled_calls
      SET
        status = ?,
        answer_transcript = ?,
        answer_recording_path = ?,
        provider_call_id = ?,
        attempts = ?,
        last_error = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      patch.status ?? existing.status,
      patch.answerTranscript !== undefined
        ? patch.answerTranscript
        : existing.answerTranscript,
      patch.answerRecordingPath !== undefined
        ? patch.answerRecordingPath
        : existing.answerRecordingPath,
      patch.providerCallId !== undefined
        ? patch.providerCallId
        : existing.providerCallId,
      patch.attempts ?? existing.attempts,
      patch.lastError !== undefined ? patch.lastError : existing.lastError,
      new Date().toISOString(),
      id
    )

    return this.getById(id)
  },
}
