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
  tenant_id: string | null
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
    tenantId: string
  }): AudioPromptRecord {
    const row: AudioPromptRow = {
      id: randomUUID(),
      name: input.name,
      kind: input.kind,
      audio_path: input.audioPath,
      mime_type: input.mimeType,
      tenant_id: input.tenantId,
      created_at: new Date().toISOString(),
    }

    db.prepare(`
      INSERT INTO audio_prompts (id, name, kind, audio_path, mime_type, tenant_id, created_at)
      VALUES (@id, @name, @kind, @audio_path, @mime_type, @tenant_id, @created_at)
    `).run(row)

    return mapRow(row)
  },

  list(tenantId: string, kind?: AudioPromptKind): AudioPromptRecord[] {
    const rows = kind
      ? (db
          .prepare(
            'SELECT * FROM audio_prompts WHERE tenant_id = ? AND kind = ? ORDER BY datetime(created_at) DESC'
          )
          .all(tenantId, kind) as AudioPromptRow[])
      : (db
          .prepare(
            'SELECT * FROM audio_prompts WHERE tenant_id = ? ORDER BY datetime(created_at) DESC'
          )
          .all(tenantId) as AudioPromptRow[])
    return rows.map(mapRow)
  },

  getById(id: string): AudioPromptRecord | null {
    const row = db
      .prepare('SELECT * FROM audio_prompts WHERE id = ?')
      .get(id) as AudioPromptRow | undefined
    return row ? mapRow(row) : null
  },

  /** The tenant a prompt belongs to, for isolation checks. */
  tenantIdOf(id: string): string | null {
    const row = db
      .prepare('SELECT tenant_id FROM audio_prompts WHERE id = ?')
      .get(id) as { tenant_id: string | null } | undefined
    return row?.tenant_id ?? null
  },

  delete(id: string): boolean {
    const result = db.prepare('DELETE FROM audio_prompts WHERE id = ?').run(id)
    return result.changes > 0
  },
}
