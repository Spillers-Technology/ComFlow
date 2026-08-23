import { LoginResponse, SessionGrant, User } from '../../../shared/src/index.js'
import { config } from '../config.js'
import { ensurePrimaryTenant } from '../db/client.js'
import { HttpError } from '../lib/errors.js'
import { hashPassword } from '../lib/password.js'
import {
  signMfaChallengeToken,
  signSessionToken,
  verifySessionToken,
  verifySignedToken,
} from '../lib/token.js'
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

/**
 * Resolve a bearer session token to its user, rejecting tokens whose epoch is
 * behind the user's current session_epoch — that is how a password change or
 * reset revokes sessions that were already handed out.
 */
export function resolveSessionUser(token: string): UserRecord | null {
  const claims = verifySessionToken(token)
  if (!claims) return null
  const record = userRepository.getById(claims.sub)
  if (!record || record.sessionEpoch !== claims.epoch) return null
  return record
}

export class AuthService {
  constructor(
    private readonly provider: AuthProvider = new LocalAuthProvider(),
    private readonly mfaService: MfaService = new MfaService()
  ) {}

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

  /**
   * A correct password either completes the login or, when the account has TOTP
   * enabled, yields a short-lived challenge to be exchanged for a session by
   * completeMfaLogin.
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.provider.authenticate(email, password)
    if (!user) {
      throw new HttpError(401, 'Invalid email or password.')
    }
    const record = userRepository.getById(user.id)
    if (!record) {
      throw new HttpError(401, 'Invalid email or password.')
    }
    if (record.totpEnabledAt) {
      return {
        mfaRequired: true,
        challengeToken: signMfaChallengeToken(record.id, record.sessionEpoch),
      }
    }
    return { token: signSessionToken(user.id, record.sessionEpoch), user }
  }

  /** Exchange an MFA challenge plus a TOTP or recovery code for a session. */
  completeMfaLogin(challengeToken: string, code: string): SessionGrant {
    const claims = verifySignedToken(challengeToken, 'mfa')
    const record = claims ? userRepository.getById(claims.sub) : null
    if (!claims || !record || record.sessionEpoch !== claims.epoch) {
      throw new HttpError(401, 'This sign-in attempt expired. Start again.')
    }
    if (!this.mfaService.verifyChallenge(record, code)) {
      throw new HttpError(401, 'Invalid verification code.')
    }
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
