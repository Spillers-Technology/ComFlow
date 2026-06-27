import { z } from 'zod'

// 'greeting' plays to inbound callers before recording their voicemail.
// 'outbound' is used as a scheduled-call message or question.
export const AudioPromptKindSchema = z.enum(['greeting', 'outbound'])

export const AudioPromptSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: AudioPromptKindSchema,
  mimeType: z.string(),
  audioUrl: z.string(),
  createdAt: z.string(),
})

export const CreateAudioPromptRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: AudioPromptKindSchema,
  // Base64-encoded audio (keeps uploads dependency-free — no multipart parser).
  audioBase64: z.string().min(1),
  mimeType: z.string().trim().min(1).default('audio/wav'),
})

export const GetAudioPromptsResponseSchema = z.object({
  items: z.array(AudioPromptSchema),
})

export const CreateAudioPromptResponseSchema = z.object({
  prompt: AudioPromptSchema,
})

export type AudioPromptKind = z.infer<typeof AudioPromptKindSchema>
export type AudioPrompt = z.infer<typeof AudioPromptSchema>
export type CreateAudioPromptRequest = z.infer<
  typeof CreateAudioPromptRequestSchema
>
export type GetAudioPromptsResponse = z.infer<
  typeof GetAudioPromptsResponseSchema
>
export type CreateAudioPromptResponse = z.infer<
  typeof CreateAudioPromptResponseSchema
>
