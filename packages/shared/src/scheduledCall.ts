import { z } from 'zod'

export const ScheduledCallStatusSchema = z.enum([
  'scheduled',
  'in_progress',
  'completed',
  'no_answer',
  'failed',
  'canceled',
])

export const ScheduledCallSchema = z.object({
  id: z.string(),
  toNumber: z.string(),
  scheduledAt: z.string(),
  messageText: z.string(),
  questionText: z.string(),
  status: ScheduledCallStatusSchema,
  answerTranscript: z.string().nullable(),
  answerRecordingUrl: z.string().nullable(),
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const CreateScheduledCallRequestSchema = z
  .object({
    toNumber: z.string().trim().min(3).max(64),
    scheduledAt: z.string().datetime(),
    // Message played to the callee on answer: provide text (synthesized via
    // TTS) OR reference an uploaded audio prompt.
    messageText: z.string().trim().max(2000).optional(),
    messageAudioPromptId: z.string().optional(),
    // The single question asked. Same text-or-upload choice.
    questionText: z.string().trim().max(500).optional(),
    questionAudioPromptId: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.messageText && !value.messageAudioPromptId) {
      ctx.addIssue({
        code: 'custom',
        path: ['messageText'],
        message: 'Provide message text or an uploaded audio prompt.',
      })
    }
    if (!value.questionText && !value.questionAudioPromptId) {
      ctx.addIssue({
        code: 'custom',
        path: ['questionText'],
        message: 'Provide question text or an uploaded audio prompt.',
      })
    }
  })

export const GetScheduledCallsResponseSchema = z.object({
  items: z.array(ScheduledCallSchema),
})

export const CreateScheduledCallResponseSchema = z.object({
  scheduledCall: ScheduledCallSchema,
})

export type ScheduledCallStatus = z.infer<typeof ScheduledCallStatusSchema>
export type ScheduledCall = z.infer<typeof ScheduledCallSchema>
export type CreateScheduledCallRequest = z.infer<
  typeof CreateScheduledCallRequestSchema
>
export type GetScheduledCallsResponse = z.infer<
  typeof GetScheduledCallsResponseSchema
>
export type CreateScheduledCallResponse = z.infer<
  typeof CreateScheduledCallResponseSchema
>
