import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from '../db/client.js'
import { HttpError } from '../lib/errors.js'
import {
  generateTotpSecret,
  totpEnrollmentUri,
  verifyTotp,
} from '../lib/totp.js'
import { auditRepository } from '../repositories/auditRepository.js'
import { UserRecord, userRepository } from '../repositories/userRepository.js'

const RECOVERY_CODE_COUNT = 10

function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex')
}

function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, '').toLowerCase()
}

/** Displayed once at enrollment, in a shape that is readable off a screen. */
function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = randomBytes(5).toString('hex')
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}

/**
 * TOTP multi-factor auth for local accounts. Enrollment is two-step: generating
 * a secret does not switch MFA on, confirming a live code does — so a user who
 * misconfigures their authenticator can never lock themselves out. SSO accounts
 * are excluded; their identity provider owns the second factor.
 */
export class MfaService {
  /** Step 1: mint a secret and hand back the authenticator enrollment URI. */
  beginEnrollment(userId: string, issuer: string): {
    secret: string
    otpauthUri: string
  } {
    const record = this.requireLocalUser(userId)
    if (record.totpEnabledAt) {
      throw new HttpError(
        409,
        'Two-factor authentication is already enabled. Disable it first to re-enroll.'
      )
    }

    const secret = generateTotpSecret()
    userRepository.setTotpSecret(record.id, secret)
    return {
      secret,
      otpauthUri: totpEnrollmentUri({
        secret,
        accountName: record.email,
        issuer,
      }),
    }
  }

  /**
   * Step 2: prove the authenticator works, then switch MFA on and return the
   * recovery codes. This is the only time the plaintext codes exist.
   */
  confirmEnrollment(userId: string, code: string): { recoveryCodes: string[] } {
    const record = this.requireLocalUser(userId)
    if (record.totpEnabledAt) {
      throw new HttpError(409, 'Two-factor authentication is already enabled.')
    }
    if (!record.totpSecret) {
      throw new HttpError(400, 'Start enrollment before confirming a code.')
    }
    if (!verifyTotp(record.totpSecret, code)) {
      throw new HttpError(400, 'That code is not valid. Check your authenticator and try again.')
    }

    const recoveryCodes = generateRecoveryCodes()
    db.transaction(() => {
      userRepository.enableTotp(record.id, recoveryCodes.map(hashRecoveryCode))
      auditRepository.record({
        actor: record.id,
        action: 'mfa.enabled',
        tenantId: record.tenantId,
      })
    })()
    return { recoveryCodes }
  }

  disable(userId: string): void {
    const record = this.requireLocalUser(userId)
    if (!record.totpEnabledAt) return

    db.transaction(() => {
      userRepository.disableTotp(record.id)
      auditRepository.record({
        actor: record.id,
        action: 'mfa.disabled',
        tenantId: record.tenantId,
      })
    })()
  }

  /**
   * Check a login code against the authenticator, falling back to the recovery
   * codes. A recovery code is consumed on use so it cannot be replayed.
   */
  verifyChallenge(record: UserRecord, code: string): boolean {
    if (!record.totpEnabledAt || !record.totpSecret) return false
    if (verifyTotp(record.totpSecret, code)) return true
    return this.consumeRecoveryCode(record, code)
  }

  private consumeRecoveryCode(record: UserRecord, code: string): boolean {
    const candidate = hashRecoveryCode(code)
    const remaining: string[] = []
    let matched = false
    for (const stored of record.totpRecoveryCodes) {
      const a = Buffer.from(stored)
      const b = Buffer.from(candidate)
      if (!matched && a.length === b.length && timingSafeEqual(a, b)) {
        matched = true
        continue
      }
      remaining.push(stored)
    }
    if (!matched) return false

    db.transaction(() => {
      userRepository.setTotpRecoveryCodes(record.id, remaining)
      auditRepository.record({
        actor: record.id,
        action: 'mfa.recovery_code_used',
        tenantId: record.tenantId,
      })
    })()
    return true
  }

  private requireLocalUser(userId: string): UserRecord {
    const record = userRepository.getById(userId)
    if (!record) throw new HttpError(404, 'User not found.')
    if (record.authProvider !== 'local') {
      throw new HttpError(
        400,
        'Two-factor authentication is managed by your identity provider for this account.'
      )
    }
    return record
  }
}
