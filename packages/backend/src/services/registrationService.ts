import { randomBytes } from 'node:crypto'
import { RegisterRequest, RegisterResponse, User } from '../../../shared/src/index.js'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'
import { hashPassword } from '../lib/password.js'
import { slugify } from '../lib/slug.js'
import { signSessionToken } from '../lib/token.js'
import { auditRepository } from '../repositories/auditRepository.js'
import { tenantLimitsRepository } from '../repositories/tenantLimitsRepository.js'
import { tenantRepository } from '../repositories/tenantRepository.js'
import { userRepository } from '../repositories/userRepository.js'
import { toApiUser } from './authService.js'
import { EmailNotificationService } from './emailNotificationService.js'

/**
 * Public self-service signup (4.0): one call creates a tenant on the
 * self-registration plan plus its org-admin, replacing the owner-run
 * provision-tenant.mjs runbook. Fraud posture: the plan's finite limits are
 * materialized immediately, paid actions stay gated behind wallet balance and
 * (when SMTP is configured) email verification, and every registration leaves
 * an audit row.
 */
export class RegistrationService {
  constructor(
    private readonly emailService: EmailNotificationService = new EmailNotificationService()
  ) {}

  private assertEnabled(): void {
    if (!config.selfRegistration.enabled) {
      throw new HttpError(404, 'Self-registration is not enabled.')
    }
    // In open mode every API caller is already the owner; a public signup
    // endpoint there would be meaningless at best. Refuse loudly.
    if (!config.auth.required) {
      throw new HttpError(
        503,
        'Self-registration requires COMFLOW_AUTH_REQUIRED=true.'
      )
    }
  }

  get verificationRequired(): boolean {
    // Verification links ride the SMTP notification transport; without it
    // there is no way to deliver them, so accounts auto-verify.
    return (
      config.selfRegistration.requireEmailVerification &&
      config.email.notificationsEnabled
    )
  }

  async register(input: RegisterRequest): Promise<RegisterResponse> {
    this.assertEnabled()

    if (userRepository.getByEmail(input.email)) {
      throw new HttpError(409, 'An account with that email already exists.')
    }

    const organizationName =
      input.organizationName ??
      input.displayName ??
      input.email.split('@')[0] ??
      'New team'

    const tenant = tenantRepository.create({
      name: organizationName,
      slug: this.uniqueSlug(organizationName),
      plan: config.selfRegistration.plan,
    })
    // Materialize finite limits now — a self-registered tenant must never sit
    // on implicit defaults that a config change could widen later.
    tenantLimitsRepository.get(tenant.id)

    const verificationRequired = this.verificationRequired
    const verificationToken = verificationRequired
      ? randomBytes(24).toString('base64url')
      : null
    const record = userRepository.create({
      email: input.email,
      displayName: input.displayName ?? null,
      passwordHash: hashPassword(input.password),
      role: 'admin',
      tenantId: tenant.id,
      emailVerified: !verificationRequired,
      verificationToken,
    })

    auditRepository.record({
      actor: record.id,
      action: 'tenant.self_register',
      tenantId: tenant.id,
      detail: {
        email: record.email,
        plan: tenant.plan,
        verificationRequired,
      },
    })

    if (verificationToken) {
      // Registration must not fail on a flaky SMTP hop; the user can request
      // help and the operator can verify manually via the audit trail.
      void this.emailService
        .sendEmailVerification(record.email, verificationToken)
        .catch(() => {})
    }

    return {
      token: signSessionToken(record.id),
      user: toApiUser(record),
      tenant,
      verificationRequired,
    }
  }

  verifyEmail(token: string): User {
    const record = userRepository.getByVerificationToken(token)
    if (!record) {
      throw new HttpError(400, 'Invalid or already-used verification link.')
    }
    userRepository.markEmailVerified(record.id)
    auditRepository.record({
      actor: record.id,
      action: 'user.email_verified',
      tenantId: record.tenantId,
    })
    return toApiUser(userRepository.getById(record.id)!)
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
