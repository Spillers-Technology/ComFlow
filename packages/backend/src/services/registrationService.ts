import {
  RegisterRequest,
  RegisterResponse,
  User,
} from '../../../shared/src/index.js'
import { DEV_SESSION_SECRET, config } from '../config.js'
import { db } from '../db/client.js'
import {
  EmailToken,
  hashEmailToken,
  isExpired,
  newEmailToken,
} from '../lib/emailToken.js'
import { HttpError } from '../lib/errors.js'
import { hashPassword } from '../lib/password.js'
import { slugify } from '../lib/slug.js'
import { signSessionToken } from '../lib/token.js'
import { auditRepository } from '../repositories/auditRepository.js'
import { tenantLimitsRepository } from '../repositories/tenantLimitsRepository.js'
import { tenantRepository } from '../repositories/tenantRepository.js'
import {
  UserRecord,
  userRepository,
} from '../repositories/userRepository.js'
import { toApiUser } from './authService.js'
import { EmailNotificationService } from './emailNotificationService.js'

type VerificationEmailSender = Pick<
  EmailNotificationService,
  'sendEmailVerification'
>

function newVerification(): EmailToken {
  return newEmailToken(config.selfRegistration.verificationTtlHours)
}

// Only a genuine email collision may be reported as "already taken". Every
// other constraint failure (trigger, check, foreign key) is a real fault and
// must surface instead of being disguised as a duplicate account.
function isDuplicateEmail(error: unknown): boolean {
  const { code, message } = error as { code?: unknown; message?: unknown }
  return (
    String(code ?? '') === 'SQLITE_CONSTRAINT_UNIQUE' &&
    /users\.email/i.test(String(message ?? ''))
  )
}

/**
 * Public hosted signup. Tenant, finite solo-plan limits, admin, and audit row
 * commit atomically. Verification tokens are random, stored only as SHA-256
 * hashes, and expire; SMTP failure never unlocks paid actions and users can ask
 * for a fresh link through the non-enumerating resend endpoint.
 */
export class RegistrationService {
  constructor(
    private readonly emailService: VerificationEmailSender = new EmailNotificationService()
  ) {}

  get enabled(): boolean {
    return (
      config.selfRegistration.enabled &&
      config.auth.required &&
      config.auth.localEnabled &&
      config.email.notificationsEnabled
    )
  }

  /** Fail at app startup instead of advertising a signup flow that cannot work. */
  assertConfiguration(): void {
    if (!config.selfRegistration.enabled) return
    if (!config.auth.required) {
      throw new Error(
        'COMFLOW_SELF_REGISTRATION=true requires COMFLOW_AUTH_REQUIRED=true.'
      )
    }
    if (!config.auth.localEnabled) {
      throw new Error(
        'Self-registration creates local accounts; AUTH_LOCAL_ENABLED must not be false.'
      )
    }
    if (!config.email.notificationsEnabled) {
      throw new Error(
        'Self-registration requires COMFLOW_EMAIL_NOTIFICATIONS_ENABLED=true for email verification.'
      )
    }
    // The dev fallback is public knowledge; on a hosted deployment anyone could
    // forge a session token for any user id with it.
    if (config.auth.sessionSecret === DEV_SESSION_SECRET) {
      throw new Error(
        'Self-registration requires a non-default AUTH_SESSION_SECRET; session tokens are forgeable with the dev fallback.'
      )
    }
    if (config.selfRegistration.plan !== 'solo') {
      throw new Error(
        `Unsupported COMFLOW_SELF_REGISTRATION_PLAN: ${config.selfRegistration.plan}`
      )
    }
    const { verificationTtlHours, planLimits, maxLifetimeCreditCents } =
      config.selfRegistration
    if (!Number.isFinite(verificationTtlHours) || verificationTtlHours <= 0) {
      throw new Error('COMFLOW_EMAIL_VERIFICATION_TTL_HOURS must be positive.')
    }
    if (
      !Number.isInteger(planLimits.maxDids) ||
      planLimits.maxDids < 1 ||
      !Number.isInteger(planLimits.maxConcurrentCalls) ||
      planLimits.maxConcurrentCalls < 1 ||
      !Number.isInteger(planLimits.includedMinutes) ||
      planLimits.includedMinutes < 0 ||
      !Number.isInteger(planLimits.markupBps) ||
      planLimits.markupBps < 10000 ||
      !Number.isInteger(maxLifetimeCreditCents) ||
      maxLifetimeCreditCents < config.billing.maxTopUpCents
    ) {
      throw new Error(
        'Self-registration plan or lifetime-credit limits are invalid.'
      )
    }
  }

  async register(input: RegisterRequest): Promise<RegisterResponse> {
    this.assertEnabled()
    const email = input.email.trim().toLowerCase()
    const organizationName =
      input.organizationName ??
      input.displayName ??
      email.split('@')[0] ??
      'New team'
    const verification = newVerification()

    let result: { tenant: RegisterResponse['tenant']; record: UserRecord }
    try {
      result = db.transaction(() => {
        if (userRepository.getByEmail(email)) {
          throw new HttpError(409, 'An account with that email already exists.')
        }
        const tenant = tenantRepository.create({
          name: organizationName,
          slug: this.uniqueSlug(organizationName),
          plan: config.selfRegistration.plan,
        })
        tenantLimitsRepository.materializeSelfRegistrationPlan(
          tenant.id,
          tenant.plan
        )
        const record = userRepository.create({
          email,
          displayName: input.displayName ?? null,
          passwordHash: hashPassword(input.password),
          role: 'admin',
          tenantId: tenant.id,
          emailVerified: false,
          verificationTokenHash: verification.tokenHash,
          verificationExpiresAt: verification.expiresAt,
          selfRegistered: true,
        })
        auditRepository.record({
          actor: record.id,
          action: 'tenant.self_register',
          tenantId: tenant.id,
          detail: { email: record.email, plan: tenant.plan },
        })
        return { tenant, record }
      })()
    } catch (error) {
      if (error instanceof HttpError) throw error
      if (isDuplicateEmail(error)) {
        throw new HttpError(409, 'An account with that email already exists.')
      }
      throw error
    }

    await this.deliverVerification(
      result.record,
      verification.rawToken,
      'email.verification_sent'
    )
    return {
      token: signSessionToken(result.record.id, result.record.sessionEpoch),
      user: toApiUser(result.record),
      tenant: result.tenant,
      verificationRequired: true,
    }
  }

  verifyEmail(token: string): User {
    const tokenHash = hashEmailToken(token)
    const record = userRepository.getByVerificationTokenHash(tokenHash)
    if (!record || isExpired(record.emailVerificationExpiresAt)) {
      throw new HttpError(400, 'Invalid or expired verification link.')
    }

    db.transaction(() => {
      userRepository.markEmailVerified(record.id)
      auditRepository.record({
        actor: record.id,
        action: 'user.email_verified',
        tenantId: record.tenantId,
      })
    })()
    return toApiUser(userRepository.getById(record.id)!)
  }

  /** Generic response is handled by the route to avoid account enumeration. */
  async resendVerification(emailInput: string): Promise<void> {
    this.assertEnabled()
    const record = userRepository.getByEmail(emailInput.trim().toLowerCase())
    if (!record || record.emailVerified) return

    const verification = newVerification()
    db.transaction(() => {
      userRepository.setEmailVerification(record.id, {
        tokenHash: verification.tokenHash,
        expiresAt: verification.expiresAt,
      })
      auditRepository.record({
        actor: record.id,
        action: 'email.verification_resent',
        tenantId: record.tenantId,
      })
    })()
    await this.deliverVerification(
      record,
      verification.rawToken,
      'email.verification_resent_delivery'
    )
  }

  /** Update a local profile, resetting ownership proof when its email changes. */
  async updateLocalProfile(
    record: UserRecord,
    input: { displayName: string | null; email: string }
  ): Promise<User> {
    const email = input.email.trim().toLowerCase()
    const changed = email !== record.email.toLowerCase()
    if (!changed) {
      return toApiUser(
        userRepository.updateProfile(record.id, {
          displayName: input.displayName,
        })!
      )
    }

    const duplicate = userRepository.getByEmail(email)
    if (duplicate && duplicate.id !== record.id) {
      throw new HttpError(409, 'A user with that email already exists.')
    }

    // Hosted accounts must prove ownership of every replacement address. In a
    // self-host without registration, preserve the established operator flow.
    if (!config.selfRegistration.enabled && !record.selfRegisteredAt) {
      return toApiUser(
        userRepository.updateProfile(record.id, {
          displayName: input.displayName,
          email,
        })!
      )
    }

    if (!config.email.notificationsEnabled) {
      throw new HttpError(
        503,
        'Email changes require the verification email transport to be enabled.'
      )
    }
    const verification = newVerification()
    const updated = db.transaction(() => {
      const user = userRepository.updateProfile(record.id, {
        displayName: input.displayName,
        email,
        verificationTokenHash: verification.tokenHash,
        verificationExpiresAt: verification.expiresAt,
      })!
      auditRepository.record({
        actor: record.id,
        action: 'user.email_changed',
        tenantId: record.tenantId,
        detail: { email },
      })
      return user
    })()
    await this.deliverVerification(
      updated,
      verification.rawToken,
      'email.verification_sent_after_change'
    )
    return toApiUser(updated)
  }

  private assertEnabled(): void {
    if (!config.selfRegistration.enabled) {
      throw new HttpError(404, 'Self-registration is not enabled.')
    }
    try {
      this.assertConfiguration()
    } catch (error) {
      throw new HttpError(503, (error as Error).message)
    }
  }

  private async deliverVerification(
    record: UserRecord,
    rawToken: string,
    successAction: string
  ): Promise<void> {
    try {
      const sent = await this.emailService.sendEmailVerification(
        record.email,
        rawToken
      )
      auditRepository.record({
        actor: 'system:email',
        action: sent ? successAction : 'email.verification_delivery_failed',
        tenantId: record.tenantId,
        detail: sent ? undefined : { reason: 'transport_disabled' },
      })
    } catch (error) {
      auditRepository.record({
        actor: 'system:email',
        action: 'email.verification_delivery_failed',
        tenantId: record.tenantId,
        detail: { reason: (error as Error).message.slice(0, 500) },
      })
    }
  }

  private uniqueSlug(name: string): string {
    const base = slugify(name)
    if (!tenantRepository.getBySlug(base)) return base
    for (let suffix = 2; suffix < 100; suffix += 1) {
      const candidate = `${base}-${suffix}`
      if (!tenantRepository.getBySlug(candidate)) return candidate
    }
    return `${base}-${Date.now()}`
  }
}
