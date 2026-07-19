import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  RegisterRequest,
  SsoProviderInfo,
  User,
} from '../../../shared/src/index.js'
import {
  getMe,
  login as apiLogin,
  register as apiRegister,
  setToken,
  verifyEmail as apiVerifyEmail,
} from '../lib/api'
import { AuthStateContext } from './authState'

/**
 * After an SSO round-trip the backend redirects to `…/login#token=<token>`
 * (or `#error=<message>`). Pull either out of the fragment and clear it so the
 * token never lingers in the address bar or browser history.
 */
function consumeAuthHash(): { token: string | null; error: string | null } {
  if (!window.location.hash) return { token: null, error: null }
  const params = new URLSearchParams(window.location.hash.slice(1))
  const token = params.get('token')
  const error = params.get('error')
  if (token || error) {
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search
    )
  }
  return { token, error }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [authRequired, setAuthRequired] = useState(false)
  const [localEnabled, setLocalEnabled] = useState(true)
  const [selfRegistrationEnabled, setSelfRegistrationEnabled] = useState(false)
  const [providers, setProviders] = useState<SsoProviderInfo[]>([])
  const [ssoError, setSsoError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const me = await getMe()
      setUser(me.user)
      setAuthRequired(me.authRequired)
      setLocalEnabled(me.localEnabled)
      // Self-registration creates a local password account. Do not offer it in
      // an SSO-only deployment where that account could not sign in later.
      setSelfRegistrationEnabled(
        me.selfRegistrationEnabled && me.localEnabled
      )
      setProviders(me.providers)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const { token, error } = consumeAuthHash()
    if (token) setToken(token)
    if (error) setSsoError(error)
    void refresh()
  }, [refresh])

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apiLogin({ email, password })
      setToken(result.token)
      setUser(result.user)
    },
    []
  )

  const register = useCallback(async (input: RegisterRequest) => {
    const result = await apiRegister(input)
    setToken(result.token)
    setUser(result.user)
    return result
  }, [])

  const verifyEmail = useCallback(async (token: string) => {
    const result = await apiVerifyEmail(token)
    setUser(current =>
      current?.id === result.user.id ? result.user : current
    )
    return result.user
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      authRequired,
      localEnabled,
      selfRegistrationEnabled,
      providers,
      ssoError,
      loading,
      login,
      register,
      verifyEmail,
      logout,
      refresh,
    }),
    [
      user,
      authRequired,
      localEnabled,
      selfRegistrationEnabled,
      providers,
      ssoError,
      loading,
      login,
      register,
      verifyEmail,
      logout,
      refresh,
    ]
  )

  return (
    <AuthStateContext.Provider value={value}>
      {children}
    </AuthStateContext.Provider>
  )
}
