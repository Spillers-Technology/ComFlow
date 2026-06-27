import crypto from 'node:crypto'

const KEY_LENGTH = 64

/** Hash a password with a per-user random salt (scrypt). Format: salt:hash hex. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const derived = crypto.scryptSync(password, salt, KEY_LENGTH)
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false

  const derived = crypto.scryptSync(
    password,
    Buffer.from(saltHex, 'hex'),
    KEY_LENGTH
  )
  const expected = Buffer.from(hashHex, 'hex')
  return (
    derived.length === expected.length &&
    crypto.timingSafeEqual(derived, expected)
  )
}
