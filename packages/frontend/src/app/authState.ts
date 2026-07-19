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
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterRequest) => Promise<RegisterResponse>
  verifyEmail: (token: string) => Promise<User>
  logout: () => void
  refresh: () => Promise<void>
}

export const AuthStateContext = createContext<AuthState | null>(null)
