import { z } from 'zod'

export const CallNoteSchema = z.object({
  id: z.string(),
  callId: z.string(),
  body: z.string(),
  createdAt: z.string(),
  authorName: z.string().nullable(),
})

export const CreateCallNoteInputSchema = z.object({
  body: z.string().trim().min(1, 'Note body is required.'),
  authorName: z.string().trim().min(1).nullable().optional(),
})

export type CallNote = z.infer<typeof CallNoteSchema>
export type CreateCallNoteInput = z.infer<typeof CreateCallNoteInputSchema>
