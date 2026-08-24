import {
  LoginResponse,
  SessionGrant,
  User,
} from '../../../shared/src/index.js'
import { config, isSecureSessionSecret } from '../config.js'
import { ensurePrimaryTenant } from '../db/client.js'
import { HttpError } from '../lib/errors.js'
import { hashPassword } from '../lib/password.js'
import { signSessionToken, verifySessionToken } from '../lib/token.js'
import { LocalAuthProvider } from '../providers/auth/local.js'
import { AuthProvider } from '../providers/auth/types.js'
import { UserRecord, userRepository } from '../repositories/userRepository.js'
import { MfaService } from './mfaService.js'

export function toApiUser(record: UserRecord): User {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    role: record.role,
    authProvider: record.authProvider,
    tenantId: record.tenantId,
    emailVerified: record.emailVerified,
  }
}

/** Resolve a session and reject it after the user's credential epoch changes. */
export function resolveSessionUser(token: string): UserRecord | null {
  const claims = verifySessionToken(token)
  if (!claims) return null
  const record = userRepository.getById(claims.sub)
  return record && record.sessionEpoch === claims.epoch ? record : null
}

export class AuthService {
  constructor(
    private readonly provider: AuthProvider = new LocalAuthProvider(),
    private readonly mfaService: MfaService = new MfaService()
  ) {}

  /** Fail closed before accepting traffic with a publicly forgeable session key. */
  assertConfiguration(): void {
    if (!config.auth.required) return
    if (!isSecureSessionSecret(config.auth.sessionSecret)) {
      throw new Error(
        'Authentication requires a non-placeholder AUTH_SESSION_SECRET of at least 32 bytes.'
      )
    }
    if (!isSecureSessionSecret(config.auth.mfaEncryptionKey)) {
      throw new Error(
        'Authentication requires COMFLOW_MFA_ENCRYPTION_KEY (or its AUTH_SESSION_SECRET fallback) to be non-placeholder and at least 32 bytes.'
      )
    }
    if (
      !Number.isFinite(config.auth.sessionTtlHours) ||
      config.auth.sessionTtlHours <= 0
    ) {
      throw new Error('COMFLOW_AUTH_SESSION_TTL_HOURS must be positive.')
    }
  }

  /**
   * Create the bootstrap platform owner from env on first boot if it doesn't
   * exist, attached to the primary tenant. The bootstrap account is the operator
   * who runs the deployment, so it gets the `owner` role (a superset of admin).
   */
  bootstrap() {
    const { bootstrapAdminEmail, bootstrapAdminPassword } = config.auth
    if (!bootstrapAdminEmail || !bootstrapAdminPassword) return
    if (userRepository.getByEmail(bootstrapAdminEmail)) return

    const tenantId = ensurePrimaryTenant(config.defaultTenant)
    userRepository.create({
      email: bootstrapAdminEmail,
      displayName: 'Administrator',
      passwordHash: hashPassword(bootstrapAdminPassword),
      role: 'owner',
      tenantId,
    })
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.provider.authenticate(email, password)
    if (!user) {
      throw new HttpError(401, 'Invalid email or password.')
    }
    const record = userRepository.getById(user.id)
    if (!record) throw new HttpError(401, 'Invalid email or password.')
    if (record.totpEnabledAt) {
      return {
        mfaRequired: true,
        challengeToken: this.mfaService.createLoginChallenge(record),
      }
    }
    return {
      token: signSessionToken(user.id, record.sessionEpoch),
      user,
    }
  }

  completeMfaLogin(challengeToken: string, code: string): SessionGrant {
    const record = this.mfaService.completeLoginChallenge(challengeToken, code)
    return {
      token: signSessionToken(record.id, record.sessionEpoch),
      user: toApiUser(record),
    }
  }

  getUserById(id: string): User | null {
    const record = userRepository.getById(id)
    return record ? toApiUser(record) : null
  }
}
