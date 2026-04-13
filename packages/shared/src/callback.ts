import { z } from 'zod'
import {
  LlmEngineConfigSchema,
  TtsEngineConfigSchema,
} from './engine.js'

export const CreateCallbackRequestSchema = z.object({
  notes: z.string().trim().min(1).max(2000).optional(),
})

export const CallbackAttemptStatusSchema = z.enum([
  'queued',
  'simulated_completed',
  'failed',
])

export const CallbackProviderSnapshotSchema = z.object({
  llm: LlmEngineConfigSchema,
  tts: TtsEngineConfigSchema,
  telephonyProvider: z.literal('fake'),
})

export const CallbackAttemptSchema = z.object({
  id: z.string(),
  callId: z.string(),
  callbackNumber: z.string(),
  notes: z.string().nullable(),
  script: z.string(),
  status: CallbackAttemptStatusSchema,
  providerSnapshot: CallbackProviderSnapshotSchema,
  audioMimeType: z.string().nullable(),
  audioUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const CreateCallbackResponseSchema = z.object({
  attempt: CallbackAttemptSchema,
})

export type CreateCallbackRequest = z.infer<typeof CreateCallbackRequestSchema>
export type CallbackAttemptStatus = z.infer<typeof CallbackAttemptStatusSchema>
export type CallbackProviderSnapshot = z.infer<
  typeof CallbackProviderSnapshotSchema
>
export type CallbackAttempt = z.infer<typeof CallbackAttemptSchema>
export type CreateCallbackResponse = z.infer<
  typeof CreateCallbackResponseSchema
>
