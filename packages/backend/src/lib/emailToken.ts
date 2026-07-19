import { createHash, randomBytes } from 'node:crypto'

/**
 * Single-use tokens delivered by email (address verification, password reset).
 * Only the SHA-256 hash is stored, so a database read cannot be replayed as a
 * working link, and every token carries an expiry.
 */

export type EmailToken = {
  rawToken: string
  tokenHash: string
  expiresAt: string
}

export function hashEmailToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newEmailToken(ttlHours: number): EmailToken {
  const rawToken = randomBytes(32).toString('base64url')
  return {
    rawToken,
    tokenHash: hashEmailToken(rawToken),
    expiresAt: new Date(Date.now() + ttlHours * 3_600_000).toISOString(),
  }
}

/** True when the token is absent or its expiry has passed. */
export function isExpired(expiresAt: string | null): boolean {
  return !expiresAt || Date.parse(expiresAt) <= Date.now()
}
