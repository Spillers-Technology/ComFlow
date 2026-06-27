import { User } from '../../../../shared/src/index.js'

/**
 * Pluggable authentication. Local accounts implement this today; an OIDC / SAML
 * provider (M2) slots in behind the same interface without touching call/inbox
 * code. Mirrors AnchorDesk's auth model so the two products converge.
 */
export interface AuthProvider {
  /** Verify credentials and return the user, or null when they don't match. */
  authenticate(email: string, password: string): Promise<User | null>
}
