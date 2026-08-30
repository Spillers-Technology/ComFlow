import { config } from '../config.js'
import { db } from '../db/client.js'
import { hashEmailToken, isExpired, newEmailToken } from '../lib/emailToken.js'
import { HttpError } from '../lib/errors.js'
import { hashPassword } from '../lib/password.js'
import { apiKeyRepository } from '../repositories/apiKeyRepository.js'
import { auditRepository } from '../repositories/auditRepository.js'
import { UserRecord, userRepository } from '../repositories/userRepository.js'
import { EmailNotificationService } from './emailNotificationService.js'

type ResetEmailSender = Pick<EmailNotificationService, 'sendPasswordReset'>

const REQUEST_COOLDOWN_MS = 60_000
const DEFAULT_RESPONSE_FLOOR_MS = 350

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))
}

/** Email-based recovery for local accounts with single-use, hashed tokens. */
export class PasswordResetService {
  constructor(
    private readonly emailService: ResetEmailSender = new EmailNotificationService(),
    private readonly responseFloorMs = DEFAULT_RESPONSE_FLOOR_MS
  ) {}

  get enabled(): boolean {
    return (
      config.auth.required &&
      config.auth.localEnabled &&
      config.email.notificationsEnabled
    )
  }

  /** Reject a broken advertised recovery path before the server starts. */
  assertConfiguration(): void {
    if (!this.enabled) return
    if (
      !Number.isFinite(config.auth.passwordResetTtlHours) ||
      config.auth.passwordResetTtlHours <= 0
    ) {
      throw new Error('COMFLOW_PASSWORD_RESET_TTL_HOURS must be positive.')
    }
  }

  /**
   * Always completes normally for unknown, SSO, and throttled addresses. The
   * route returns one generic response and the per-account reservation prevents
   * repeated requests from continuously invalidating a legitimate email link.
   */
  async request(emailInput: string): Promise<void> {
    const startedAt = Date.now()
    const record = userRepository.getByEmail(emailInput.trim().toLowerCase())
    let delivery: Promise<unknown> = Promise.resolve()

    if (record && this.canReset(record)) {
      const token = newEmailToken(config.auth.passwordResetTtlHours)
      const reserved = db.transaction(() => {
        const accepted = userRepository.reservePasswordReset(record.id, {
          tokenHash: token.tokenHash,
          expiresAt: token.expiresAt,
          notAfter: new Date(Date.now() - REQUEST_COOLDOWN_MS).toISOString(),
        })
        if (accepted) {
          auditRepository.record({
            actor: 'system:password-recovery',
            action: 'password.reset_requested',
            tenantId: record.tenantId,
            detail: { userId: record.id },
          })
        }
        return accepted
      })()

      if (reserved) {
        // Attach the rejection handler before allowing this promise to outlive
        // the response floor. Slow SMTP must not reveal account existence.
        delivery = this.emailService
          .sendPasswordReset(
            record.email,
            token.rawToken,
            config.auth.passwordResetTtlHours
          )
          .catch(error => {
            console.error('[password-reset] delivery failed', error)
          })
      }
    }

    await Promise.race([delivery, delay(this.responseFloorMs)])
    await delay(this.responseFloorMs - (Date.now() - startedAt))
  }

  /** Consume one token, replace the password, and revoke every bearer grant. */
  reset(token: string, password: string): void {
    const tokenHash = hashEmailToken(token)
    // Acquire the write lock before reading the token. Two app processes cannot
    // both validate the same row and then consume it successfully.
    db.transaction(() => {
      const record = userRepository.getByPasswordResetTokenHash(tokenHash)
      if (
        !record ||
        isExpired(record.passwordResetExpiresAt) ||
        !this.canReset(record)
      ) {
        throw new HttpError(400, 'Invalid or expired reset link.')
      }
      userRepository.replacePassword(record.id, hashPassword(password))
      // Recovery is an incident boundary: automation keys minted by a prior
      // session are bearer credentials too and must not survive unnoticed.
      const apiKeysRevoked = apiKeyRepository.removeAllForUser(record.id)
      auditRepository.record({
        actor: 'system:password-recovery',
        action: 'password.reset_completed',
        tenantId: record.tenantId,
        detail: { userId: record.id, apiKeysRevoked },
      })
    }).immediate()
  }

  private canReset(record: UserRecord): boolean {
    return this.enabled && record.authProvider === 'local'
  }
}
