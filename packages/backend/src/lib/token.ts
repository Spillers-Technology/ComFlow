import crypto from 'node:crypto'
import { config } from '../config.js'

/**
 * `session` grants access. `mfa` only attests that a password was accepted and
 * a second factor is still owed — it must never be usable where a session token
 * is expected, which is why every consumer checks `typ`.
 */
export type TokenPurpose = 'session' | 'mfa'

export type SignedClaims = {
  sub: string
  exp: number
  /** Snapshot of the user's session epoch — see verifySignedToken. */
  epoch: number
  typ: TokenPurpose
}

/** Short window: just long enough to read a code off a phone. */
const MFA_CHALLENGE_TTL_MS = 5 * 60_000

function sign(claims: SignedClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', config.auth.sessionSecret)
    .update(payload)
    .digest('base64url')
  return `${payload}.${signature}`
}

/**
 * Compact HMAC-signed session token (no JWT dependency). Encodes the user id,
 * an expiry, and the user's session epoch; the SSO milestone can replace this
 * behind the AuthProvider.
 */
export function signSessionToken(userId: string, epoch: number): string {
  return sign({
    sub: userId,
    exp: Date.now() + config.auth.sessionTtlHours * 3_600_000,
    epoch,
    typ: 'session',
  })
}

/** Issued after a correct password when the account also requires TOTP. */
export function signMfaChallengeToken(userId: string, epoch: number): string {
  return sign({
    sub: userId,
    exp: Date.now() + MFA_CHALLENGE_TTL_MS,
    epoch,
    typ: 'mfa',
  })
}

/**
 * Returns the token's claims when the signature is valid, the purpose matches,
 * and it has not expired, else null. Callers must additionally check `epoch`
 * against the user's current session_epoch: tokens are stateless, so bumping
 * that column (on password change or reset) is what invalidates tokens already
 * issued.
 */
export function verifySignedToken(
  token: string,
  purpose: TokenPurpose
): SignedClaims | null {
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
    ) as SignedClaims
    if (Date.now() > data.exp) return null
    // Tokens minted before epochs and purposes existed are session tokens at
    // epoch 0, matching the column default for pre-existing users.
    const typ = data.typ ?? 'session'
    if (typ !== purpose) return null
    return { ...data, epoch: data.epoch ?? 0, typ }
  } catch {
    return null
  }
}

export function verifySessionToken(token: string): SignedClaims | null {
  return verifySignedToken(token, 'session')
}
