import { z } from 'zod'

export const EngineKindSchema = z.enum(['llm', 'stt', 'tts'])

export const LlmProviderSchema = z.enum(['fake', 'openai', 'anthropic'])
export const SttProviderSchema = z.enum(['fake', 'openai', 'elevenlabs'])
export const TtsProviderSchema = z.enum(['fake', 'openai', 'elevenlabs'])

const NullableNonEmptyStringSchema = z
  .string()
  .trim()
  .min(1)
  .nullable()
  .catch(null)

export const LlmEngineConfigSchema = z
  .object({
    provider: LlmProviderSchema,
    model: NullableNonEmptyStringSchema,
  })
  .superRefine((value, context) => {
    if (value.provider !== 'fake' && !value.model) {
      context.addIssue({
        code: 'custom',
        path: ['model'],
        message: 'Model is required for the selected LLM provider.',
      })
    }
  })

export const SttEngineConfigSchema = z
  .object({
    provider: SttProviderSchema,
    model: NullableNonEmptyStringSchema,
  })
  .superRefine((value, context) => {
    if (value.provider !== 'fake' && !value.model) {
      context.addIssue({
        code: 'custom',
        path: ['model'],
        message: 'Model is required for the selected STT provider.',
      })
    }
  })

export const TtsEngineConfigSchema = z
  .object({
    provider: TtsProviderSchema,
    model: NullableNonEmptyStringSchema,
    voice: NullableNonEmptyStringSchema,
  })
  .superRefine((value, context) => {
    if (value.provider !== 'fake' && !value.model) {
      context.addIssue({
        code: 'custom',
        path: ['model'],
        message: 'Model is required for the selected TTS provider.',
      })
    }

    if (value.provider !== 'fake' && !value.voice) {
      context.addIssue({
        code: 'custom',
        path: ['voice'],
        message: 'Voice is required for the selected TTS provider.',
      })
    }
  })

export const EngineSettingsSchema = z.object({
  llm: LlmEngineConfigSchema,
  stt: SttEngineConfigSchema,
  tts: TtsEngineConfigSchema,
})

export const EngineReadinessSchema = z.object({
  provider: z.string(),
  model: z.string().nullable(),
  voice: z.string().nullable().optional(),
  ready: z.boolean(),
  missingSecrets: z.array(z.string()),
})

export const EngineReadinessMapSchema = z.object({
  llm: EngineReadinessSchema,
  stt: EngineReadinessSchema,
  tts: EngineReadinessSchema,
})

export const UpdateEngineSettingsInputSchema = EngineSettingsSchema

export const EngineTestResultSchema = z.object({
  engine: EngineKindSchema,
  success: z.boolean(),
  message: z.string(),
  checkedAt: z.string(),
})

export type EngineKind = z.infer<typeof EngineKindSchema>
export type LlmProvider = z.infer<typeof LlmProviderSchema>
export type SttProvider = z.infer<typeof SttProviderSchema>
export type TtsProvider = z.infer<typeof TtsProviderSchema>
export type LlmEngineConfig = z.infer<typeof LlmEngineConfigSchema>
export type SttEngineConfig = z.infer<typeof SttEngineConfigSchema>
export type TtsEngineConfig = z.infer<typeof TtsEngineConfigSchema>
export type EngineSettings = z.infer<typeof EngineSettingsSchema>
export type EngineReadiness = z.infer<typeof EngineReadinessSchema>
export type EngineReadinessMap = z.infer<typeof EngineReadinessMapSchema>
export type UpdateEngineSettingsInput = z.infer<
  typeof UpdateEngineSettingsInputSchema
>
export type EngineTestResult = z.infer<typeof EngineTestResultSchema>
