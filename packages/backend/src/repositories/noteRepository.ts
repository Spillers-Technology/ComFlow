import { randomUUID } from 'node:crypto'
import {
  CallNote,
  CallNoteSchema,
  CreateCallNoteInput,
} from '../../../shared/src/index.js'
import { db } from '../db/client.js'

type NoteRow = {
  id: string
  call_id: string
  body: string
  author_name: string | null
  created_at: string
}

function mapNote(row: NoteRow): CallNote {
  return CallNoteSchema.parse({
    id: row.id,
    callId: row.call_id,
    body: row.body,
    createdAt: row.created_at,
    authorName: row.author_name,
  })
}

export const noteRepository = {
  listByCallId(callId: string): CallNote[] {
    const rows = db
      .prepare(
        'SELECT * FROM call_notes WHERE call_id = ? ORDER BY datetime(created_at) ASC'
      )
      .all(callId) as NoteRow[]

    return rows.map(mapNote)
  },

  create(callId: string, input: CreateCallNoteInput): CallNote {
    const row: NoteRow = {
      id: randomUUID(),
      call_id: callId,
      body: input.body,
      author_name: input.authorName ?? null,
      created_at: new Date().toISOString(),
    }

    db.prepare(`
      INSERT INTO call_notes (id, call_id, body, author_name, created_at)
      VALUES (@id, @call_id, @body, @author_name, @created_at)
    `).run(row)

    return mapNote(row)
  },
}
