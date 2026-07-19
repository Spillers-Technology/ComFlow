import {
  AuthProvidersResponseSchema,
  CompleteMfaLoginRequest,
  CompletePasswordResetResponseSchema,
  MfaConfirmResponseSchema,
  MfaEnrollResponseSchema,
  MfaStatusSchema,
  SessionGrantSchema,
  OutboundAccessRequest,
  OutboundAccessResponseSchema,
  OutboundStatusSchema,
  PlanBand,
  PlanCatalogResponseSchema,
  PortalResponseSchema,
  SubscriptionResponseSchema,
  ApiKeyListResponseSchema,
  ChangePassword,
  CreateApiKeyResponseSchema,
  CreateApiKeyRequest,
  CreateAudioPromptRequest,
  CreateAudioPromptResponseSchema,
  CreateCallNoteInput,
  CreateCallNoteResponseSchema,
  CreateGroupRequest,
  CreateMailboxRequest,
  CreateMailboxResponseSchema,
  CreateUserRequest,
  CreateScheduledCallRequest,
  CreateScheduledCallResponseSchema,
  EngineTestResponseSchema,
  GetAudioPromptsResponseSchema,
  GetEngineSettingsResponseSchema,
  GetCallResponseSchema,
  GetCallsResponseSchema,
  GetMailboxesResponseSchema,
  GetScheduledCallsResponseSchema,
  GetSipSettingsApiResponseSchema,
  GetSipStatusApiResponseSchema,
  GroupListResponseSchema,
  GroupResponseSchema,
  GroupUsersResponseSchema,
  LoginRequest,
  LoginResponseSchema,
  MeResponseSchema,
  PatchCallResponseSchema,
  RestartSipApiResponseSchema,
  CallUpdateInput,
  SsoGroupMapping,
  SsoGroupMappingsResponseSchema,
  UpdateEngineSettingsRequest,
  UpdateEngineSettingsResponseSchema,
  UpdateGroupRequest,
  UpdateMailboxRequest,
  UpdateMailboxResponseSchema,
  UpdateUserRequest,
  UpdateSipSettingsRequest,
  UpdateSipSettingsApiResponseSchema,
  UpdateProfile,
  UserListResponseSchema,
  UserResponseSchema,
  CheckoutResponseSchema,
  CreateTenantRequest,
  GetProvisionedDidsResponseSchema,
  GetTenantsResponseSchema,
  GetUsageResponseSchema,
  ProvisionDidRequest,
  ProvisionDidResponseSchema,
  RegisterRequest,
  RegisterResponseSchema,
  ForgotPasswordResponseSchema,
  ResendVerificationResponseSchema,
  SearchDidsResponseSchema,
  TenantLimitsResponseSchema,
  TenantResponseSchema,
  UpdateTenantLimitsRequest,
  UpdateTenantRequest,
  WalletResponseSchema,
} from '../../../shared/src/index.js'

const TOKEN_KEY = 'comflow_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(input: RequestInfo, init: RequestInit, schema: {
  parse: (value: unknown) => T
}): Promise<T> {
  const token = getToken()
  const response = await fetch(input, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
    ...init,
  })

  // A 401 while holding a token means the session expired (vs. a fresh failed
  // login, which carries no token). Clear it and bounce to the login screen.
  if (response.status === 401 && token && input !== '/api/auth/login') {
    setToken(null)
    if (window.location.pathname !== '/login') {
      window.location.assign('/login')
    }
    throw new Error('Your session has expired. Please sign in again.')
  }

  const json = await response.json()
  if (!response.ok) {
    throw new Error((json as { error?: string }).error ?? 'Request failed.')
  }

  return schema.parse(json)
}

export function getCalls(query?: { status?: string; q?: string; intent?: string }) {
  const params = new URLSearchParams()
  if (query?.status) params.set('status', query.status)
  if (query?.q) params.set('q', query.q)
  if (query?.intent) params.set('intent', query.intent)

  return request(
    `/api/calls${params.size ? `?${params.toString()}` : ''}`,
    { method: 'GET' },
    GetCallsResponseSchema
  )
}

export function getCall(id: string) {
  return request(`/api/calls/${id}`, { method: 'GET' }, GetCallResponseSchema)
}

export function patchCall(id: string, payload: CallUpdateInput) {
  return request(
    `/api/calls/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    PatchCallResponseSchema
  )
}

export function addCallNote(id: string, payload: CreateCallNoteInput) {
  return request(
    `/api/calls/${id}/notes`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    CreateCallNoteResponseSchema
  )
}

export function getEngineSettings() {
  return request(
    '/api/settings/engines',
    { method: 'GET' },
    GetEngineSettingsResponseSchema
  )
}

export function updateEngineSettings(payload: UpdateEngineSettingsRequest) {
  return request(
    '/api/settings/engines',
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    UpdateEngineSettingsResponseSchema
  )
}

export function testEngine(engine: 'llm' | 'stt' | 'tts') {
  return request(
    `/api/settings/engines/test/${engine}`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    EngineTestResponseSchema
  )
}

export function getSipSettings() {
  return request(
    '/api/settings/sip',
    { method: 'GET' },
    GetSipSettingsApiResponseSchema
  )
}

export function updateSipSettings(payload: UpdateSipSettingsRequest) {
  return request(
    '/api/settings/sip',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    UpdateSipSettingsApiResponseSchema
  )
}

export function getSipStatus() {
  return request(
    '/api/settings/sip/status',
    { method: 'GET' },
    GetSipStatusApiResponseSchema
  )
}

export function restartSipEdge() {
  return request(
    '/api/settings/sip/restart',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    RestartSipApiResponseSchema
  )
}

export function getScheduledCalls() {
  return request(
    '/api/scheduled-calls',
    { method: 'GET' },
    GetScheduledCallsResponseSchema
  )
}

export function createScheduledCall(payload: CreateScheduledCallRequest) {
  return request(
    '/api/scheduled-calls',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    CreateScheduledCallResponseSchema
  )
}

export function cancelScheduledCall(id: string) {
  return request(
    `/api/scheduled-calls/${id}`,
    { method: 'DELETE' },
    CreateScheduledCallResponseSchema
  )
}

export function getPrompts(kind?: 'greeting' | 'outbound') {
  return request(
    `/api/prompts${kind ? `?kind=${kind}` : ''}`,
    { method: 'GET' },
    GetAudioPromptsResponseSchema
  )
}

export function createPrompt(payload: CreateAudioPromptRequest) {
  return request(
    '/api/prompts',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    CreateAudioPromptResponseSchema
  )
}

export async function deletePrompt(id: string) {
  const token = getToken()
  const response = await fetch(`/api/prompts/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok && response.status !== 204) {
    throw new Error('Failed to delete prompt.')
  }
}

function filenameFromDisposition(disposition: string | null) {
  if (!disposition) return null

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  if (encoded) {
    return decodeURIComponent(encoded)
  }

  const plain = /filename="?([^";]+)"?/i.exec(disposition)?.[1]
  return plain ?? null
}

export async function downloadRecording(url: string) {
  const token = getToken()
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) {
    let message = 'Failed to download recording.'
    try {
      const json = (await response.json()) as { error?: string }
      message = json.error ?? message
    } catch {
      // Non-JSON media/error responses fall back to the generic message.
    }
    throw new Error(message)
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download =
    filenameFromDisposition(response.headers.get('Content-Disposition')) ??
    'comflow-voicemail.wav'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

export function getMe() {
  return request('/api/auth/me', { method: 'GET' }, MeResponseSchema)
}

export function getProfile() {
  return request('/api/me', { method: 'GET' }, UserResponseSchema)
}

export function updateProfile(payload: UpdateProfile) {
  return request(
    '/api/me',
    { method: 'PATCH', body: JSON.stringify(payload) },
    UserResponseSchema
  )
}

export async function changePassword(payload: ChangePassword) {
  const token = getToken()
  const response = await fetch('/api/me/password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    let message = 'Failed to change password.'
    try {
      message = ((await response.json()) as { error?: string }).error ?? message
    } catch {
      // keep the generic message
    }
    throw new Error(message)
  }
  // Changing the password revokes every session, including this one. The
  // backend hands back a replacement so the current tab stays signed in.
  const body = (await response.json()) as { token?: string }
  if (body.token) setToken(body.token)
}

export function getApiKeys() {
  return request('/api/me/keys', { method: 'GET' }, ApiKeyListResponseSchema)
}

export function createApiKey(payload: CreateApiKeyRequest) {
  return request(
    '/api/me/keys',
    { method: 'POST', body: JSON.stringify(payload) },
    CreateApiKeyResponseSchema
  )
}

export async function revokeApiKey(id: string) {
  const token = getToken()
  const response = await fetch(`/api/me/keys/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok && response.status !== 204) {
    let message = 'Failed to revoke API key.'
    try {
      message = ((await response.json()) as { error?: string }).error ?? message
    } catch {
      // keep the generic message
    }
    throw new Error(message)
  }
}

export function getAuthProviders() {
  return request(
    '/api/auth/providers',
    { method: 'GET' },
    AuthProvidersResponseSchema
  )
}

// --- RBAC: groups (admin only) ---

export function getGroups() {
  return request('/api/groups', { method: 'GET' }, GroupListResponseSchema)
}

export function getAssignableUsers() {
  return request('/api/groups/users', { method: 'GET' }, GroupUsersResponseSchema)
}

export function createGroup(payload: CreateGroupRequest) {
  return request(
    '/api/groups',
    { method: 'POST', body: JSON.stringify(payload) },
    GroupResponseSchema
  )
}

export function updateGroup(id: string, payload: UpdateGroupRequest) {
  return request(
    `/api/groups/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    GroupResponseSchema
  )
}

export async function deleteGroup(id: string) {
  const token = getToken()
  const response = await fetch(`/api/groups/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok && response.status !== 204) {
    throw new Error('Failed to delete group.')
  }
}

export function setGroupMembers(id: string, userIds: string[]) {
  return request(
    `/api/groups/${id}/members`,
    { method: 'PUT', body: JSON.stringify({ userIds }) },
    GroupResponseSchema
  )
}

export function setGroupMailboxes(id: string, mailboxIds: string[]) {
  return request(
    `/api/groups/${id}/mailboxes`,
    { method: 'PUT', body: JSON.stringify({ mailboxIds }) },
    GroupResponseSchema
  )
}

export function getSsoGroupMappings() {
  return request(
    '/api/groups/mappings',
    { method: 'GET' },
    SsoGroupMappingsResponseSchema
  )
}

export function setSsoGroupMappings(mappings: SsoGroupMapping[]) {
  return request(
    '/api/groups/mappings',
    { method: 'PUT', body: JSON.stringify({ mappings }) },
    SsoGroupMappingsResponseSchema
  )
}

export function login(payload: LoginRequest) {
  return request(
    '/api/auth/login',
    { method: 'POST', body: JSON.stringify(payload) },
    LoginResponseSchema
  )
}

export function register(payload: RegisterRequest) {
  return request(
    '/api/auth/register',
    { method: 'POST', body: JSON.stringify(payload) },
    RegisterResponseSchema
  )
}

export function verifyEmail(token: string) {
  return request(
    '/api/auth/verify-email',
    { method: 'POST', body: JSON.stringify({ token }) },
    UserResponseSchema
  )
}

export function resendVerification(email: string) {
  return request(
    '/api/auth/resend-verification',
    { method: 'POST', body: JSON.stringify({ email }) },
    ResendVerificationResponseSchema
  )
}

export function getOutboundStatus() {
  return request('/api/outbound', { method: 'GET' }, OutboundStatusSchema)
}

export function requestOutboundAccess(payload: OutboundAccessRequest) {
  return request(
    '/api/outbound/request',
    { method: 'POST', body: JSON.stringify(payload) },
    OutboundAccessResponseSchema
  )
}

export function getPlans() {
  return request('/api/billing/plans', { method: 'GET' }, PlanCatalogResponseSchema)
}

export function getSubscription() {
  return request(
    '/api/billing/subscription',
    { method: 'GET' },
    SubscriptionResponseSchema
  )
}

export function startSubscription(band: PlanBand) {
  return request(
    '/api/billing/subscribe',
    { method: 'POST', body: JSON.stringify({ band }) },
    CheckoutResponseSchema
  )
}

export function openBillingPortal() {
  return request(
    '/api/billing/portal',
    { method: 'POST', body: JSON.stringify({}) },
    PortalResponseSchema
  )
}

export function completeMfaLogin(payload: CompleteMfaLoginRequest) {
  return request(
    '/api/auth/login/mfa',
    { method: 'POST', body: JSON.stringify(payload) },
    SessionGrantSchema
  )
}

export function getMfaStatus() {
  return request('/api/me/mfa', { method: 'GET' }, MfaStatusSchema)
}

export function beginMfaEnrollment() {
  return request(
    '/api/me/mfa/enroll',
    { method: 'POST', body: JSON.stringify({}) },
    MfaEnrollResponseSchema
  )
}

export function confirmMfaEnrollment(code: string) {
  return request(
    '/api/me/mfa/confirm',
    { method: 'POST', body: JSON.stringify({ code }) },
    MfaConfirmResponseSchema
  )
}

export async function disableMfa(password: string) {
  const token = getToken()
  const response = await fetch('/api/me/mfa', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ password }),
  })
  if (!response.ok && response.status !== 204) {
    let message = 'Failed to disable two-factor authentication.'
    try {
      message = ((await response.json()) as { error?: string }).error ?? message
    } catch {
      // keep the generic message
    }
    throw new Error(message)
  }
}

export function forgotPassword(email: string) {
  return request(
    '/api/auth/forgot-password',
    { method: 'POST', body: JSON.stringify({ email }) },
    ForgotPasswordResponseSchema
  )
}

export function resetPassword(token: string, password: string) {
  return request(
    '/api/auth/reset-password',
    { method: 'POST', body: JSON.stringify({ token, password }) },
    CompletePasswordResetResponseSchema
  )
}

export function getMailboxes() {
  return request('/api/mailboxes', { method: 'GET' }, GetMailboxesResponseSchema)
}

export function createMailbox(payload: CreateMailboxRequest) {
  return request(
    '/api/mailboxes',
    { method: 'POST', body: JSON.stringify(payload) },
    CreateMailboxResponseSchema
  )
}

export function updateMailbox(id: string, payload: UpdateMailboxRequest) {
  return request(
    `/api/mailboxes/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    UpdateMailboxResponseSchema
  )
}

export async function deleteMailbox(id: string) {
  const token = getToken()
  const response = await fetch(`/api/mailboxes/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok && response.status !== 204) {
    let message = 'Failed to delete mailbox.'
    try {
      message = ((await response.json()) as { error?: string }).error ?? message
    } catch {
      // keep the generic message
    }
    throw new Error(message)
  }
}

// --- Users (admin only) ---

export function getUsers() {
  return request('/api/users', { method: 'GET' }, UserListResponseSchema)
}

export function createUser(payload: CreateUserRequest) {
  return request(
    '/api/users',
    { method: 'POST', body: JSON.stringify(payload) },
    UserResponseSchema
  )
}

export function updateUser(id: string, payload: UpdateUserRequest) {
  return request(
    `/api/users/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    UserResponseSchema
  )
}

export async function resetUserPassword(id: string, password: string) {
  const token = getToken()
  const response = await fetch(`/api/users/${id}/password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ password }),
  })
  if (!response.ok && response.status !== 204) {
    let message = 'Failed to reset password.'
    try {
      message = ((await response.json()) as { error?: string }).error ?? message
    } catch {
      // keep the generic message
    }
    throw new Error(message)
  }
}

export async function deleteUser(id: string) {
  const token = getToken()
  const response = await fetch(`/api/users/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok && response.status !== 204) {
    let message = 'Failed to delete user.'
    try {
      message = ((await response.json()) as { error?: string }).error ?? message
    } catch {
      // keep the generic message
    }
    throw new Error(message)
  }
}

// --- Usage & billing (3.0) ---

export function getUsage() {
  return request('/api/usage', { method: 'GET' }, GetUsageResponseSchema)
}

export function getWallet() {
  return request('/api/billing', { method: 'GET' }, WalletResponseSchema)
}

export function startTopUp(amountCents: number) {
  return request(
    '/api/billing/topup',
    { method: 'POST', body: JSON.stringify({ amountCents }) },
    CheckoutResponseSchema
  )
}

// --- DIDs (admin) ---

export function getDids() {
  return request('/api/dids', { method: 'GET' }, GetProvisionedDidsResponseSchema)
}

export function searchDids(country: 'US' | 'CA', query?: string) {
  const params = new URLSearchParams({ country })
  if (query) params.set('query', query)
  return request(
    `/api/dids/search?${params.toString()}`,
    { method: 'GET' },
    SearchDidsResponseSchema
  )
}

export function provisionDid(payload: ProvisionDidRequest) {
  return request(
    '/api/dids',
    { method: 'POST', body: JSON.stringify(payload) },
    ProvisionDidResponseSchema
  )
}

export async function releaseDid(number: string) {
  const token = getToken()
  const response = await fetch(`/api/dids/${encodeURIComponent(number)}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok && response.status !== 204) {
    let message = 'Failed to release DID.'
    try {
      message = ((await response.json()) as { error?: string }).error ?? message
    } catch {
      // keep the generic message
    }
    throw new Error(message)
  }
}

// --- Tenants (owner only) ---

export function getTenants() {
  return request('/api/tenants', { method: 'GET' }, GetTenantsResponseSchema)
}

export function createTenant(payload: CreateTenantRequest) {
  return request(
    '/api/tenants',
    { method: 'POST', body: JSON.stringify(payload) },
    TenantResponseSchema
  )
}

export function updateTenant(id: string, payload: UpdateTenantRequest) {
  return request(
    `/api/tenants/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    TenantResponseSchema
  )
}

export function getTenantLimits(id: string) {
  return request(
    `/api/tenants/${id}/limits`,
    { method: 'GET' },
    TenantLimitsResponseSchema
  )
}

export function updateTenantLimits(
  id: string,
  payload: UpdateTenantLimitsRequest
) {
  return request(
    `/api/tenants/${id}/limits`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    TenantLimitsResponseSchema
  )
}

export function createTenantUser(id: string, payload: CreateUserRequest) {
  return request(
    `/api/tenants/${id}/users`,
    { method: 'POST', body: JSON.stringify(payload) },
    UserResponseSchema
  )
}

/** Read a File into the base64 string the prompt-upload endpoint expects. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // strip the "data:<mime>;base64," prefix
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('File read failed.'))
    reader.readAsDataURL(file)
  })
}
