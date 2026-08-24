import { createHash, randomBytes } from 'node:crypto'

export type EmailToken = {
  rawToken: string
  tokenHash: string
  expiresAt: string
}

/** Hash a high-entropy token before persistence so a database read cannot replay it. */
export function hashEmailToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newEmailToken(ttlHours: number): EmailToken {
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    throw new Error('Email-token TTL must be positive.')
  }
  const rawToken = randomBytes(32).toString('base64url')
  return {
    rawToken,
    tokenHash: hashEmailToken(rawToken),
    expiresAt: new Date(Date.now() + ttlHours * 3_600_000).toISOString(),
  }
}

export function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true
  const parsed = Date.parse(expiresAt)
  return !Number.isFinite(parsed) || parsed <= Date.now()
}
