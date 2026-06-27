import { LoginResponse, User } from '../../../shared/src/index.js'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'
import { hashPassword } from '../lib/password.js'
import { signSessionToken } from '../lib/token.js'
import { LocalAuthProvider } from '../providers/auth/local.js'
import { AuthProvider } from '../providers/auth/types.js'
import { UserRecord, userRepository } from '../repositories/userRepository.js'

export function toApiUser(record: UserRecord): User {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    role: record.role,
    authProvider: record.authProvider,
  }
}

export class AuthService {
  constructor(
    private readonly provider: AuthProvider = new LocalAuthProvider()
  ) {}

  /** Create the bootstrap admin from env on first boot if it doesn't exist. */
  bootstrap() {
    const { bootstrapAdminEmail, bootstrapAdminPassword } = config.auth
    if (!bootstrapAdminEmail || !bootstrapAdminPassword) return
    if (userRepository.getByEmail(bootstrapAdminEmail)) return

    userRepository.create({
      email: bootstrapAdminEmail,
      displayName: 'Administrator',
      passwordHash: hashPassword(bootstrapAdminPassword),
      role: 'admin',
    })
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.provider.authenticate(email, password)
    if (!user) {
      throw new HttpError(401, 'Invalid email or password.')
    }
    return { token: signSessionToken(user.id), user }
  }

  getUserById(id: string): User | null {
    const record = userRepository.getById(id)
    return record ? toApiUser(record) : null
  }
}
