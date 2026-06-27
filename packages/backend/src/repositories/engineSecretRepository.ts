import {
  EngineSecretKey,
  UpdateEngineSecretsInput,
  UpdateEngineSecretsInputSchema,
} from '../../../shared/src/index.js'
import { db } from '../db/client.js'

const SECRET_KEYS = [
  'openaiApiKey',
  'anthropicApiKey',
  'elevenLabsApiKey',
] as const satisfies readonly EngineSecretKey[]

const DB_KEYS: Record<EngineSecretKey, string> = {
  openaiApiKey: 'openai_api_key',
  anthropicApiKey: 'anthropic_api_key',
  elevenLabsApiKey: 'elevenlabs_api_key',
}

const APP_KEYS = Object.fromEntries(
  SECRET_KEYS.map(key => [DB_KEYS[key], key])
) as Record<string, EngineSecretKey>

type EngineSecretRow = {
  secret_key: string
  secret_value: string
}

export type StoredEngineSecrets = Partial<Record<EngineSecretKey, string>>

export const engineSecretRepository = {
  getAll(): StoredEngineSecrets {
    const rows = db
      .prepare('SELECT secret_key, secret_value FROM engine_secret_overrides')
      .all() as EngineSecretRow[]

    const secrets: StoredEngineSecrets = {}
    for (const row of rows) {
      const key = APP_KEYS[row.secret_key]
      if (key && row.secret_value) {
        secrets[key] = row.secret_value
      }
    }

    return secrets
  },

  applyPatch(input: UpdateEngineSecretsInput): StoredEngineSecrets {
    const patch = UpdateEngineSecretsInputSchema.parse(input)
    const now = new Date().toISOString()

    for (const key of SECRET_KEYS) {
      const value = patch[key]
      if (value === undefined) continue

      if (value === null) {
        db.prepare(
          'DELETE FROM engine_secret_overrides WHERE secret_key = ?'
        ).run(DB_KEYS[key])
        continue
      }

      db.prepare(
        `INSERT INTO engine_secret_overrides (secret_key, secret_value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(secret_key) DO UPDATE SET
           secret_value = excluded.secret_value,
           updated_at = excluded.updated_at`
      ).run(DB_KEYS[key], value, now)
    }

    return this.getAll()
  },
}
