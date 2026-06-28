import { z } from 'zod'
import {
  CallListItemSchema,
  CallRecordSchema,
  ExtractedCallFieldsSchema,
} from './call.js'
import {
  EngineKindSchema,
  EngineReadinessMapSchema,
  EngineSecretStatusMapSchema,
  EngineSettingsSchema,
  EngineTestResultSchema,
} from './engine.js'
import { CallNoteSchema } from './note.js'
import {
  GetSipSettingsResponseSchema,
  GetSipStatusResponseSchema,
  RestartSipResponseSchema,
} from './sip.js'

export const InboundTelephonyWebhookSchema = z.object({
  telephonyCallId: z.string().trim().min(1),
  source: z.enum(['fake', 'telephony']).default('fake'),
  fromNumber: z.string().trim().min(1),
  // --- Inbound mailbox routing keys (both optional) ---
  // The dialed DID — the number the caller reached. Matched against
  // `mailboxes.number` first; the primary routing key.
  toNumber: z.string().trim().min(1).optional(),
  // The SIP account label the call arrived on. Matched against
  // `mailboxes.sipAccountRef` when no DID matches; the secondary key.
  accountLabel: z.string().trim().min(1).optional(),
  // Resolution is total: toNumber → accountLabel → default mailbox, so an
  // absent or unknown key always lands the call in the default mailbox.
  receivedAt: z.string().optional(),
  transcript: z.string().optional(),
})

export const RecordingCompleteWebhookSchema = z.object({
  telephonyCallId: z.string().trim().min(1),
  recordingUrl: z.string().url().optional(),
  recordingBase64: z.string().optional(),
  mimeType: z.string().default('audio/wav'),
  transcript: z.string().optional(),
})

export const GetCallsResponseSchema = z.object({
  items: z.array(CallListItemSchema),
})

export const GetCallResponseSchema = z.object({
  call: CallRecordSchema,
  notes: z.array(CallNoteSchema),
  recordingUrl: z.string().nullable(),
  recordingDownloadUrl: z.string().nullable(),
})

export const PatchCallResponseSchema = z.object({
  call: CallRecordSchema,
})

export const CreateCallNoteResponseSchema = z.object({
  note: CallNoteSchema,
})

export const TelephonyAcceptedResponseSchema = z.object({
  callId: z.string(),
  accepted: z.literal(true),
})

export const RecordingProcessedResponseSchema = z.object({
  callId: z.string(),
  processed: z.literal(true),
})

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  db: z.literal('ok'),
  settings: EngineSettingsSchema,
  readiness: EngineReadinessMapSchema,
  secrets: EngineSecretStatusMapSchema,
})

export const GetEngineSettingsResponseSchema = z.object({
  settings: EngineSettingsSchema,
  readiness: EngineReadinessMapSchema,
  secrets: EngineSecretStatusMapSchema,
})

export const UpdateEngineSettingsResponseSchema =
  GetEngineSettingsResponseSchema

export const EngineTestRouteParamsSchema = z.object({
  engine: EngineKindSchema,
})

export const EngineTestResponseSchema = z.object({
  result: EngineTestResultSchema,
})

export const GetSipSettingsApiResponseSchema = GetSipSettingsResponseSchema
export const UpdateSipSettingsApiResponseSchema = GetSipSettingsResponseSchema
export const GetSipStatusApiResponseSchema = GetSipStatusResponseSchema
export const RestartSipApiResponseSchema = RestartSipResponseSchema

export const ApiErrorSchema = z.object({
  error: z.string(),
})

export const ExtractedCallFieldsResponseSchema = ExtractedCallFieldsSchema

export type InboundTelephonyWebhookInput = z.infer<
  typeof InboundTelephonyWebhookSchema
>
export type RecordingCompleteWebhookInput = z.infer<
  typeof RecordingCompleteWebhookSchema
>
export type GetCallsResponse = z.infer<typeof GetCallsResponseSchema>
export type GetCallResponse = z.infer<typeof GetCallResponseSchema>
export type PatchCallResponse = z.infer<typeof PatchCallResponseSchema>
export type CreateCallNoteResponse = z.infer<
  typeof CreateCallNoteResponseSchema
>
export type HealthResponse = z.infer<typeof HealthResponseSchema>
export type GetEngineSettingsResponse = z.infer<
  typeof GetEngineSettingsResponseSchema
>
export type UpdateEngineSettingsResponse = z.infer<
  typeof UpdateEngineSettingsResponseSchema
>
export type GetSipSettingsApiResponse = z.infer<
  typeof GetSipSettingsApiResponseSchema
>
export type UpdateSipSettingsApiResponse = z.infer<
  typeof UpdateSipSettingsApiResponseSchema
>
export type GetSipStatusApiResponse = z.infer<
  typeof GetSipStatusApiResponseSchema
>
export type RestartSipApiResponse = z.infer<typeof RestartSipApiResponseSchema>
export type ApiError = z.infer<typeof ApiErrorSchema>
