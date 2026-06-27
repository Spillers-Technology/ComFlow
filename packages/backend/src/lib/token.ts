import crypto from 'node:crypto'
import { config } from '../config.js'

/**
 * Compact HMAC-signed session token (no JWT dependency). Encodes the user id
 * and an expiry; the SSO milestone can replace this behind the AuthProvider.
 */
export function signSessionToken(userId: string): string {
  const exp = Date.now() + config.auth.sessionTtlHours * 3_600_000
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp })).toString(
    'base64url'
  )
  const signature = crypto
    .createHmac('sha256', config.auth.sessionSecret)
    .update(payload)
    .digest('base64url')
  return `${payload}.${signature}`
}

/** Returns the user id when the token is valid and unexpired, else null. */
export function verifySessionToken(token: string): string | null {
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
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      sub: string
      exp: number
    }
    if (Date.now() > data.exp) return null
    return data.sub
  } catch {
    return null
  }
}
