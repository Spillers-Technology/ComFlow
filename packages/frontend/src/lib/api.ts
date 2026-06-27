import {
  CreateAudioPromptRequest,
  CreateAudioPromptResponseSchema,
  CreateCallNoteInput,
  CreateCallNoteResponseSchema,
  CreateScheduledCallRequest,
  CreateScheduledCallResponseSchema,
  EngineTestResponseSchema,
  GetAudioPromptsResponseSchema,
  GetEngineSettingsResponseSchema,
  GetCallResponseSchema,
  GetCallsResponseSchema,
  GetMailboxesResponseSchema,
  GetScheduledCallsResponseSchema,
  LoginRequest,
  LoginResponseSchema,
  MeResponseSchema,
  PatchCallResponseSchema,
  CallUpdateInput,
  UpdateEngineSettingsRequest,
  UpdateEngineSettingsResponseSchema,
  UpdateMailboxRequest,
  UpdateMailboxResponseSchema,
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

export function login(payload: LoginRequest) {
  return request(
    '/api/auth/login',
    { method: 'POST', body: JSON.stringify(payload) },
    LoginResponseSchema
  )
}

export function getMailboxes() {
  return request('/api/mailboxes', { method: 'GET' }, GetMailboxesResponseSchema)
}

export function updateMailbox(id: string, payload: UpdateMailboxRequest) {
  return request(
    `/api/mailboxes/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    UpdateMailboxResponseSchema
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
