import {
  UpdateSipSecretsInput,
  UpdateSipSecretsInputSchema,
} from '../../../shared/src/index.js'
import { db } from '../db/client.js'

const SIP_AUTH_PASSWORD_KEY = 'sip_auth_password'

type SipSecretRow = {
  secret_value: string
}

export const sipSecretRepository = {
  getAuthPassword(): string | null {
    const row = db
      .prepare(
        'SELECT secret_value FROM engine_secret_overrides WHERE secret_key = ?'
      )
      .get(SIP_AUTH_PASSWORD_KEY) as SipSecretRow | undefined

    return row?.secret_value ?? null
  },

  applyPatch(input: UpdateSipSecretsInput): string | null {
    const patch = UpdateSipSecretsInputSchema.parse(input)
    if (patch.authPassword === undefined) {
      return this.getAuthPassword()
    }

    if (patch.authPassword === null) {
      db.prepare('DELETE FROM engine_secret_overrides WHERE secret_key = ?').run(
        SIP_AUTH_PASSWORD_KEY
      )
      return this.getAuthPassword()
    }

    db.prepare(
      `INSERT INTO engine_secret_overrides (secret_key, secret_value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(secret_key) DO UPDATE SET
         secret_value = excluded.secret_value,
         updated_at = excluded.updated_at`
    ).run(SIP_AUTH_PASSWORD_KEY, patch.authPassword, new Date().toISOString())

    return this.getAuthPassword()
  },
}
