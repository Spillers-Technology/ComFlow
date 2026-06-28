import { db } from '../db/client.js'

export type SsoLoginState = {
  state: string
  provider: string
  nonce: string | null
  codeVerifier: string | null
  createdAt: string
}

type Row = {
  state: string
  provider: string
  nonce: string | null
  code_verifier: string | null
  created_at: string
}

// Login states older than this are abandoned round-trips; sweep them on write.
const MAX_AGE_MS = 10 * 60 * 1000

function mapRow(row: Row): SsoLoginState {
  return {
    state: row.state,
    provider: row.provider,
    nonce: row.nonce,
    codeVerifier: row.code_verifier,
    createdAt: row.created_at,
  }
}

export const ssoStateRepository = {
  create(input: {
    state: string
    provider: string
    nonce: string | null
    codeVerifier: string | null
  }): void {
    this.sweep()
    db.prepare(`
      INSERT INTO sso_login_states (state, provider, nonce, code_verifier, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      input.state,
      input.provider,
      input.nonce,
      input.codeVerifier,
      new Date().toISOString()
    )
  },

  /** Atomically read-and-delete a state, so it can only be redeemed once. */
  consume(state: string): SsoLoginState | null {
    const row = db
      .prepare('SELECT * FROM sso_login_states WHERE state = ?')
      .get(state) as Row | undefined
    if (!row) return null
    db.prepare('DELETE FROM sso_login_states WHERE state = ?').run(state)
    const mapped = mapRow(row)
    if (Date.now() - new Date(mapped.createdAt).getTime() > MAX_AGE_MS) {
      return null
    }
    return mapped
  },

  sweep(): void {
    const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString()
    db.prepare('DELETE FROM sso_login_states WHERE created_at < ?').run(cutoff)
  },
}
