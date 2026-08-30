import { randomBytes } from 'node:crypto'
import { db } from '../db/client.js'
import { HttpError } from '../lib/errors.js'
import { decryptMfaSecret, encryptMfaSecret } from '../lib/mfaSecret.js'
import {
  generateTotpSecret,
  matchingTotpCounter,
  totpEnrollmentUri,
} from '../lib/totp.js'
import { auditRepository } from '../repositories/auditRepository.js'
import {
  hashMfaChallenge,
  hashMfaRecoveryCode,
  mfaRepository,
} from '../repositories/mfaRepository.js'
import { UserRecord, userRepository } from '../repositories/userRepository.js'
import { verifyPassword } from '../lib/password.js'

const CHALLENGE_TTL_MS = 5 * 60_000
const ENROLLMENT_TTL_MS = 10 * 60_000
const MAX_CHALLENGE_ATTEMPTS = 5
const RECOVERY_CODE_COUNT = 10

function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = randomBytes(10).toString('hex')
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15)}`
  })
}

export class MfaService {
  beginEnrollment(userId: string, password: string) {
    const secret = generateTotpSecret()
    const expiresAt = new Date(Date.now() + ENROLLMENT_TTL_MS).toISOString()
    const record = db.transaction(() => {
      // Hold the write lock while re-reading the password and MFA state. An
      // enrollment request that started before another request enabled MFA
      // must not wake up afterward and silently replace/disable that factor.
      const current = this.requireLocalUser(userId)
      this.requirePassword(current, password)
      if (current.totpEnabledAt) {
        throw new HttpError(409, 'Two-factor authentication is already enabled.')
      }
      const reserved = userRepository.setMfaEnrollment(current.id, {
        encryptedSecret: encryptMfaSecret(secret),
        expiresAt,
      })
      if (!reserved) {
        throw new HttpError(409, 'Two-factor authentication is already enabled.')
      }
      mfaRepository.removeRecoveryCodes(current.id)
      auditRepository.record({
        actor: current.id,
        action: 'mfa.enrollment_started',
        tenantId: current.tenantId,
      })
      return current
    }).immediate()
    return {
      secret,
      otpauthUri: totpEnrollmentUri({
        secret,
        accountName: record.email,
        issuer: 'ComFlow',
      }),
      expiresAt,
    }
  }

  confirmEnrollment(userId: string, code: string) {
    const recoveryCodes = generateRecoveryCodes()
    const result = db.transaction(() => {
      const record = this.requireLocalUser(userId)
      if (record.totpEnabledAt) {
        throw new HttpError(409, 'Two-factor authentication is already enabled.')
      }
      if (
        !record.totpSecretEncrypted ||
        !record.totpEnrollmentExpiresAt ||
        Date.parse(record.totpEnrollmentExpiresAt) <= Date.now()
      ) {
        throw new HttpError(400, 'MFA enrollment expired. Start again.')
      }
      const counter = matchingTotpCounter(
        decryptMfaSecret(record.totpSecretEncrypted),
        code
      )
      if (counter === null) {
        throw new HttpError(400, 'That authenticator code is not valid.')
      }
      userRepository.enableMfa(record.id, counter)
      mfaRepository.replaceRecoveryCodes(
        record.id,
        recoveryCodes.map(hashMfaRecoveryCode)
      )
      userRepository.bumpSessionEpoch(record.id)
      auditRepository.record({
        actor: record.id,
        action: 'mfa.enabled',
        tenantId: record.tenantId,
      })
      return userRepository.getById(record.id)!
    }).immediate()
    return { recoveryCodes, record: result }
  }

  disable(userId: string, password: string, code: string): UserRecord {
    return db.transaction(() => {
      const record = this.requireLocalUser(userId)
      this.requirePassword(record, password)
      if (!record.totpEnabledAt) {
        throw new HttpError(409, 'Two-factor authentication is not enabled.')
      }
      if (!this.consumeFactor(record, code)) {
        throw new HttpError(400, 'That verification code is not valid.')
      }
      userRepository.disableMfa(record.id)
      mfaRepository.removeRecoveryCodes(record.id)
      mfaRepository.consumeAllChallenges(record.id)
      userRepository.bumpSessionEpoch(record.id)
      auditRepository.record({
        actor: record.id,
        action: 'mfa.disabled',
        tenantId: record.tenantId,
      })
      return userRepository.getById(record.id)!
    }).immediate()
  }

  createLoginChallenge(record: UserRecord): string {
    if (!record.totpEnabledAt || !record.totpSecretEncrypted) {
      throw new HttpError(401, 'Invalid email or password.')
    }
    return db.transaction(() =>
      mfaRepository.createChallenge(
        record.id,
        record.sessionEpoch,
        new Date(Date.now() + CHALLENGE_TTL_MS).toISOString()
      )
    ).immediate()
  }

  completeLoginChallenge(token: string, code: string): UserRecord {
    const outcome = db.transaction(() => {
      const tokenHash = hashMfaChallenge(token)
      const challenge = mfaRepository.getChallenge(tokenHash)
      if (
        !challenge ||
        challenge.consumedAt ||
        challenge.attempts >= MAX_CHALLENGE_ATTEMPTS ||
        Date.parse(challenge.expiresAt) <= Date.now()
      ) {
        return { record: null, invalidChallenge: true }
      }
      const record = userRepository.getById(challenge.userId)
      if (
        !record ||
        !record.totpEnabledAt ||
        record.sessionEpoch !== challenge.sessionEpoch
      ) {
        mfaRepository.consumeAllChallenges(challenge.userId)
        return { record: null, invalidChallenge: true }
      }
      if (!this.consumeFactor(record, code)) {
        mfaRepository.recordFailedAttempt(tokenHash, MAX_CHALLENGE_ATTEMPTS)
        return { record: null, invalidChallenge: false }
      }
      mfaRepository.consumeAllChallenges(record.id)
      auditRepository.record({
        actor: record.id,
        action: 'mfa.login_completed',
        tenantId: record.tenantId,
      })
      return { record: userRepository.getById(record.id)!, invalidChallenge: false }
    }).immediate()

    if (!outcome.record) {
      throw new HttpError(
        401,
        outcome.invalidChallenge
          ? 'This sign-in attempt expired. Start again.'
          : 'Invalid verification code.'
      )
    }
    return outcome.record
  }

  recoveryCodeCount(userId: string): number {
    return mfaRepository.recoveryCodeCount(userId)
  }

  private consumeFactor(record: UserRecord, code: string): boolean {
    if (!record.totpSecretEncrypted) return false
    const counter = matchingTotpCounter(
      decryptMfaSecret(record.totpSecretEncrypted),
      code
    )
    if (counter !== null) {
      return userRepository.acceptTotpCounter(record.id, counter)
    }
    return mfaRepository.consumeRecoveryCode(
      record.id,
      hashMfaRecoveryCode(code)
    )
  }

  private requireLocalUser(userId: string): UserRecord {
    const record = userRepository.getById(userId)
    if (!record) throw new HttpError(404, 'User not found.')
    if (record.authProvider !== 'local' || !record.passwordHash) {
      throw new HttpError(
        400,
        'Two-factor authentication is managed by your identity provider.'
      )
    }
    return record
  }

  private requirePassword(record: UserRecord, password: string): void {
    if (!record.passwordHash || !verifyPassword(password, record.passwordHash)) {
      throw new HttpError(400, 'Current password is incorrect.')
    }
  }
}
