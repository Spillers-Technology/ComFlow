import { User } from '../../../../shared/src/index.js'
import { verifyPassword } from '../../lib/password.js'
import { userRepository } from '../../repositories/userRepository.js'
import { AuthProvider } from './types.js'

function toApiUser(record: {
  id: string
  email: string
  displayName: string | null
  role: User['role']
  authProvider: string
  tenantId: string
  emailVerified: boolean
}): User {
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

export class LocalAuthProvider implements AuthProvider {
  async authenticate(email: string, password: string): Promise<User | null> {
    const record = userRepository.getByEmail(email)
    if (!record || !record.passwordHash) return null
    if (!verifyPassword(password, record.passwordHash)) return null
    return toApiUser(record)
  }
}
