import {
  CreateCallNoteInput,
  CreateCallNoteResponseSchema,
  GetCallResponseSchema,
  GetCallsResponseSchema,
  PatchCallResponseSchema,
  CallUpdateInput,
} from '../../../shared/src/index.js'

async function request<T>(input: RequestInfo, init: RequestInit, schema: {
  parse: (value: unknown) => T
}): Promise<T> {
  const response = await fetch(input, {
    headers: {
      'Content-Type': 'application/json',
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
