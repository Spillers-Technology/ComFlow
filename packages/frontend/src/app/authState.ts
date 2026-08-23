import { createContext } from 'react'
import {
  RegisterRequest,
  RegisterResponse,
  SsoProviderInfo,
  User,
} from '../../../shared/src/index.js'

export interface AuthState {
  user: User | null
  authRequired: boolean
  localEnabled: boolean
  selfRegistrationEnabled: boolean
  providers: SsoProviderInfo[]
  ssoError: string | null
  loading: boolean
  /** Resolves to an MFA challenge token, or null when sign-in is complete. */
  login: (email: string, password: string) => Promise<string | null>
  completeMfaLogin: (challengeToken: string, code: string) => Promise<void>
  register: (input: RegisterRequest) => Promise<RegisterResponse>
  verifyEmail: (token: string) => Promise<User>
  logout: () => void
  refresh: () => Promise<void>
}

export const AuthStateContext = createContext<AuthState | null>(null)
