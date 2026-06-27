import { randomUUID } from 'node:crypto'
import {
  AudioPrompt,
  AudioPromptKind,
  AudioPromptSchema,
} from '../../../shared/src/index.js'
import { db } from '../db/client.js'

type AudioPromptRow = {
  id: string
  name: string
  kind: AudioPromptKind
  audio_path: string
  mime_type: string
  created_at: string
}

export type AudioPromptRecord = AudioPrompt & { audioPath: string }

function mapRow(row: AudioPromptRow): AudioPromptRecord {
  const api = AudioPromptSchema.parse({
    id: row.id,
    name: row.name,
    kind: row.kind,
    mimeType: row.mime_type,
    audioUrl: `/api/prompts/${row.id}/audio`,
    createdAt: row.created_at,
  })
  return { ...api, audioPath: row.audio_path }
}

export const audioPromptRepository = {
  create(input: {
    name: string
    kind: AudioPromptKind
    audioPath: string
    mimeType: string
  }): AudioPromptRecord {
    const row: AudioPromptRow = {
      id: randomUUID(),
      name: input.name,
      kind: input.kind,
      audio_path: input.audioPath,
      mime_type: input.mimeType,
      created_at: new Date().toISOString(),
    }

    db.prepare(`
      INSERT INTO audio_prompts (id, name, kind, audio_path, mime_type, created_at)
      VALUES (@id, @name, @kind, @audio_path, @mime_type, @created_at)
    `).run(row)

    return mapRow(row)
  },

  list(kind?: AudioPromptKind): AudioPromptRecord[] {
    const rows = kind
      ? (db
          .prepare(
            'SELECT * FROM audio_prompts WHERE kind = ? ORDER BY datetime(created_at) DESC'
          )
          .all(kind) as AudioPromptRow[])
      : (db
          .prepare('SELECT * FROM audio_prompts ORDER BY datetime(created_at) DESC')
          .all() as AudioPromptRow[])
    return rows.map(mapRow)
  },

  getById(id: string): AudioPromptRecord | null {
    const row = db
      .prepare('SELECT * FROM audio_prompts WHERE id = ?')
      .get(id) as AudioPromptRow | undefined
    return row ? mapRow(row) : null
  },

  delete(id: string): boolean {
    const result = db.prepare('DELETE FROM audio_prompts WHERE id = ?').run(id)
    return result.changes > 0
  },
}
