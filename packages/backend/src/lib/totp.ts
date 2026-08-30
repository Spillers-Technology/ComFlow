import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6
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

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) throw new Error('Invalid base32 TOTP secret.')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export function totpCodeForCounter(secret: string, counter: number): string {
  const message = Buffer.alloc(8)
  message.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  message.writeUInt32BE(counter >>> 0, 4)
  const digest = createHmac('sha1', base32Decode(secret)).update(message).digest()
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

/** Return the exact accepted counter so persistence can reject its replay. */
export function matchingTotpCounter(
  secret: string,
  code: string,
  now = Date.now()
): number | null {
  const candidate = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(candidate)) return null
  const current = Math.floor(now / 1000 / STEP_SECONDS)
  let matched: number | null = null
  for (let offset = -SKEW_STEPS; offset <= SKEW_STEPS; offset += 1) {
    const counter = current + offset
    const expected = Buffer.from(totpCodeForCounter(secret, counter))
    const actual = Buffer.from(candidate)
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      // Prefer the newest matching counter in the extremely unlikely event of
      // a six-digit collision across accepted steps.
      matched = counter
    }
  }
  return matched
}

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
