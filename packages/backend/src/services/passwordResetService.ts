import { config } from '../config.js'
import { db } from '../db/client.js'
import { hashEmailToken, isExpired, newEmailToken } from '../lib/emailToken.js'
import { HttpError } from '../lib/errors.js'
import { hashPassword } from '../lib/password.js'
import { auditRepository } from '../repositories/auditRepository.js'
import { UserRecord, userRepository } from '../repositories/userRepository.js'
import { EmailNotificationService } from './emailNotificationService.js'

type ResetEmailSender = Pick<EmailNotificationService, 'sendPasswordReset'>

/**
 * Email-token password reset for local accounts. Tokens are random, stored only
 * as SHA-256 hashes, and short-lived. Consuming one bumps the user's session
 * epoch, so any session an attacker already holds stops working — the point of
 * a reset is to end their access, not just to change the password.
 */
export class PasswordResetService {
  constructor(
    private readonly emailService: ResetEmailSender = new EmailNotificationService()
  ) {}

  /**
   * Issue and email a reset token. Callers must respond identically regardless
   * of outcome so this endpoint cannot be used to discover which addresses have
   * accounts.
   */
  async request(emailInput: string): Promise<void> {
    const record = userRepository.getByEmail(emailInput.trim().toLowerCase())
    if (!record || !this.canReset(record)) return

    const token = newEmailToken(config.auth.passwordResetTtlHours)
    db.transaction(() => {
      userRepository.setPasswordReset(record.id, {
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
      })
      auditRepository.record({
        actor: record.id,
        action: 'password.reset_requested',
        tenantId: record.tenantId,
      })
    })()

    // Delivery failure must not surface to the caller (it would leak that the
    // account exists) and must not roll back the token — the user can retry.
    try {
      await this.emailService.sendPasswordReset(
        record.email,
        token.rawToken,
        config.auth.passwordResetTtlHours
      )
    } catch (error) {
      console.error('[password-reset] delivery failed', error)
    }
  }

  /** Consume a reset token and set the new password. */
  reset(token: string, password: string): void {
    const record = userRepository.getByPasswordResetTokenHash(
      hashEmailToken(token)
    )
    if (
      !record ||
      isExpired(record.passwordResetExpiresAt) ||
      !this.canReset(record)
    ) {
      throw new HttpError(400, 'Invalid or expired reset link.')
    }

    const passwordHash = hashPassword(password)
    db.transaction(() => {
      userRepository.setPassword(record.id, passwordHash)
      userRepository.clearPasswordReset(record.id)
      userRepository.bumpSessionEpoch(record.id)
      auditRepository.record({
        actor: record.id,
        action: 'password.reset_completed',
        tenantId: record.tenantId,
      })
    })()
  }

  /**
   * SSO-backed accounts have no local password to reset; sending them a reset
   * link would create one and quietly open a second way into the account.
   */
  private canReset(record: UserRecord): boolean {
    return config.auth.localEnabled && record.authProvider === 'local'
  }
}
