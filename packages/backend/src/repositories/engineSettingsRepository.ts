import { EngineSettings, EngineSettingsSchema } from '../../../shared/src/index.js'
import { db } from '../db/client.js'

type EngineSettingsRow = {
  llm_provider: string
  llm_model: string | null
  stt_provider: string
  stt_model: string | null
  tts_provider: string
  tts_model: string | null
  tts_voice: string | null
}

function mapSettings(row: EngineSettingsRow): EngineSettings {
  return EngineSettingsSchema.parse({
    llm: {
      provider: row.llm_provider,
      model: row.llm_model,
    },
    stt: {
      provider: row.stt_provider,
      model: row.stt_model,
    },
    tts: {
      provider: row.tts_provider,
      model: row.tts_model,
      voice: row.tts_voice,
    },
  })
}

export const engineSettingsRepository = {
  get(): EngineSettings | null {
    const row = db.prepare('SELECT * FROM engine_settings WHERE id = 1').get() as
      | EngineSettingsRow
      | undefined
    return row ? mapSettings(row) : null
  },

  upsert(settings: EngineSettings): EngineSettings {
    const value = EngineSettingsSchema.parse(settings)
    db.prepare(`
      INSERT INTO engine_settings (
        id, llm_provider, llm_model, stt_provider, stt_model,
        tts_provider, tts_model, tts_voice, updated_at
      )
      VALUES (1, @llm_provider, @llm_model, @stt_provider, @stt_model, @tts_provider, @tts_model, @tts_voice, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        llm_provider = excluded.llm_provider,
        llm_model = excluded.llm_model,
        stt_provider = excluded.stt_provider,
        stt_model = excluded.stt_model,
        tts_provider = excluded.tts_provider,
        tts_model = excluded.tts_model,
        tts_voice = excluded.tts_voice,
        updated_at = excluded.updated_at
    `).run({
      llm_provider: value.llm.provider,
      llm_model: value.llm.model,
      stt_provider: value.stt.provider,
      stt_model: value.stt.model,
      tts_provider: value.tts.provider,
      tts_model: value.tts.model,
      tts_voice: value.tts.voice,
      updated_at: new Date().toISOString(),
    })

    return value
  },
}
