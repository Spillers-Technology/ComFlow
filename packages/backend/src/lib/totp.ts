import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * RFC 6238 time-based one-time passwords (RFC 4226 HOTP over a time counter),
 * hand-rolled to match the rest of the codebase's no-extra-dependency style.
 * Defaults are the ones every authenticator app assumes: SHA-1, 30-second
 * steps, 6 digits.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6
/** Accept the neighbouring steps so modest clock skew doesn't lock users out. */
const SKEW_STEPS = 1

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31]
  return output
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) throw new Error('Invalid base32 character in TOTP secret.')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** The code for a given step counter. Exported for tests. */
export function totpCodeForCounter(secret: string, counter: number): string {
  const key = base32Decode(secret)
  const message = Buffer.alloc(8)
  // Counters stay well inside 2^53, so splitting into two 32-bit halves is safe.
  message.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  message.writeUInt32BE(counter >>> 0, 4)

  const digest = createHmac('sha1', key).update(message).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff)

  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0')
}

export function currentTotpCode(secret: string, now = Date.now()): string {
  return totpCodeForCounter(secret, Math.floor(now / 1000 / STEP_SECONDS))
}

/**
 * Constant-time check of a user-supplied code against the accepted window.
 * Callers must still enforce single-use (a code stays valid for its whole step)
 * and rate-limit attempts — six digits is only 10^6 of entropy.
 */
export function verifyTotp(
  secret: string,
  code: string,
  now = Date.now()
): boolean {
  const candidate = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(candidate)) return false

  const counter = Math.floor(now / 1000 / STEP_SECONDS)
  let matched = false
  for (let offset = -SKEW_STEPS; offset <= SKEW_STEPS; offset += 1) {
    const expected = Buffer.from(totpCodeForCounter(secret, counter + offset))
    const actual = Buffer.from(candidate)
    // Keep looping even after a match so timing doesn't reveal which step hit.
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      matched = true
    }
  }
  return matched
}

/** The URI an authenticator app consumes, usually rendered as a QR code. */
export function totpEnrollmentUri(input: {
  secret: string
  accountName: string
  issuer: string
}): string {
  const label = `${input.issuer}:${input.accountName}`
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  })
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`
}
