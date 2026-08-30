import { createHash, randomBytes } from 'node:crypto'
import { db } from '../db/client.js'

export type MfaChallengeRecord = {
  tokenHash: string
  userId: string
  sessionEpoch: number
  attempts: number
  expiresAt: string
  consumedAt: string | null
  createdAt: string
}

type ChallengeRow = {
  token_hash: string
  user_id: string
  session_epoch: number
  attempts: number
  expires_at: string
  consumed_at: string | null
  created_at: string
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function mapChallenge(row: ChallengeRow): MfaChallengeRecord {
  return {
    tokenHash: row.token_hash,
    userId: row.user_id,
    sessionEpoch: row.session_epoch,
    attempts: row.attempts,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
  }
}

export function hashMfaChallenge(token: string): string {
  return hash(token)
}

export function hashMfaRecoveryCode(code: string): string {
  return hash(code.replace(/[\s-]/g, '').toLowerCase())
}

export const mfaRepository = {
  createChallenge(userId: string, sessionEpoch: number, expiresAt: string): string {
    const rawToken = randomBytes(32).toString('base64url')
    const now = new Date().toISOString()
    db.prepare(`
      UPDATE mfa_login_challenges SET consumed_at = ?
      WHERE user_id = ? AND consumed_at IS NULL
    `).run(now, userId)
    db.prepare(`
      DELETE FROM mfa_login_challenges
      WHERE expires_at <= ? OR consumed_at IS NOT NULL
    `).run(now)
    db.prepare(`
      INSERT INTO mfa_login_challenges (
        token_hash, user_id, session_epoch, attempts, expires_at, consumed_at, created_at
      ) VALUES (?, ?, ?, 0, ?, NULL, ?)
    `).run(hashMfaChallenge(rawToken), userId, sessionEpoch, expiresAt, now)
    return rawToken
  },

  getChallenge(tokenHash: string): MfaChallengeRecord | null {
    const row = db
      .prepare('SELECT * FROM mfa_login_challenges WHERE token_hash = ?')
      .get(tokenHash) as ChallengeRow | undefined
    return row ? mapChallenge(row) : null
  },

  recordFailedAttempt(tokenHash: string, maxAttempts: number): void {
    const now = new Date().toISOString()
    db.prepare(`
      UPDATE mfa_login_challenges
      SET attempts = attempts + 1,
          consumed_at = CASE WHEN attempts + 1 >= ? THEN ? ELSE consumed_at END
      WHERE token_hash = ? AND consumed_at IS NULL
    `).run(maxAttempts, now, tokenHash)
  },

  consumeAllChallenges(userId: string): void {
    db.prepare(`
      UPDATE mfa_login_challenges SET consumed_at = ?
      WHERE user_id = ? AND consumed_at IS NULL
    `).run(new Date().toISOString(), userId)
  },

  replaceRecoveryCodes(userId: string, hashes: string[]): void {
    db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(userId)
    const insert = db.prepare(`
      INSERT INTO mfa_recovery_codes (user_id, code_hash, created_at)
      VALUES (?, ?, ?)
    `)
    const now = new Date().toISOString()
    for (const codeHash of hashes) insert.run(userId, codeHash, now)
  },

  consumeRecoveryCode(userId: string, codeHash: string): boolean {
    return (
      db
        .prepare(
          'DELETE FROM mfa_recovery_codes WHERE user_id = ? AND code_hash = ?'
        )
        .run(userId, codeHash).changes === 1
    )
  },

  recoveryCodeCount(userId: string): number {
    const row = db
      .prepare(
        'SELECT COUNT(*) AS count FROM mfa_recovery_codes WHERE user_id = ?'
      )
      .get(userId) as { count: number }
    return row.count
  },

  removeRecoveryCodes(userId: string): void {
    db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(userId)
  },
}
