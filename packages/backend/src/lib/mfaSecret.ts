import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { config } from '../config.js'

function encryptionKey(): Buffer {
  return createHash('sha256')
    .update('comflow:mfa-secret:v1\0')
    .update(config.auth.mfaEncryptionKey)
    .digest()
}

export function encryptMfaSecret(secret: string): string {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', nonce, tag, ciphertext]
    .map(value => (typeof value === 'string' ? value : value.toString('base64url')))
    .join('.')
}

export function decryptMfaSecret(value: string): string {
  const [version, nonceRaw, tagRaw, ciphertextRaw] = value.split('.')
  if (version !== 'v1' || !nonceRaw || !tagRaw || !ciphertextRaw) {
    throw new Error('Unsupported encrypted MFA secret.')
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(nonceRaw, 'base64url')
  )
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
