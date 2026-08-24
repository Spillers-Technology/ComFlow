import crypto from 'node:crypto'
import { config } from '../config.js'

export type SessionClaims = {
  sub: string
  exp: number
  /** Snapshot used to revoke all older sessions after credential recovery. */
  epoch: number
}

/** Compact HMAC-signed session token with a revocable user epoch. */
export function signSessionToken(userId: string, epoch: number): string {
  const claims: SessionClaims = {
    sub: userId,
    exp: Date.now() + config.auth.sessionTtlHours * 3_600_000,
    epoch,
  }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', config.auth.sessionSecret)
    .update(payload)
    .digest('base64url')
  return `${payload}.${signature}`
}

/** Returns validated claims when the token is authentic and current in time. */
export function verifySessionToken(token: string): SessionClaims | null {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null

  const expected = crypto
    .createHmac('sha256', config.auth.sessionSecret)
    .update(payload)
    .digest('base64url')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  try {
    const data = JSON.parse(
      Buffer.from(payload, 'base64url').toString()
    ) as Partial<SessionClaims>
    if (
      typeof data.sub !== 'string' ||
      !data.sub ||
      typeof data.exp !== 'number' ||
      !Number.isFinite(data.exp)
    ) {
      return null
    }
    if (Date.now() > data.exp) return null
    // Tokens from before the epoch field existed map to the migration default.
    const epoch = data.epoch ?? 0
    if (!Number.isInteger(epoch) || epoch < 0) return null
    return { sub: data.sub, exp: data.exp, epoch }
  } catch {
    return null
  }
}
