import { z } from 'zod'

export const MailboxSchema = z.object({
  id: z.string(),
  name: z.string(),
  number: z.string().nullable(),
  greetingPromptId: z.string().nullable(),
  sipAccountRef: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const UpdateMailboxRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    number: z.string().trim().min(1).max(64).nullable().optional(),
    greetingPromptId: z.string().nullable().optional(),
    sipAccountRef: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  })

export const CreateMailboxRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  number: z.string().trim().min(1).max(64).nullable().optional(),
  sipAccountRef: z.string().trim().min(1).max(200).nullable().optional(),
  greetingPromptId: z.string().nullable().optional(),
})

export const GetMailboxesResponseSchema = z.object({
  items: z.array(MailboxSchema),
})

export const UpdateMailboxResponseSchema = z.object({
  mailbox: MailboxSchema,
})

export const CreateMailboxResponseSchema = z.object({
  mailbox: MailboxSchema,
})

export type Mailbox = z.infer<typeof MailboxSchema>
export type CreateMailboxRequest = z.infer<typeof CreateMailboxRequestSchema>
export type UpdateMailboxRequest = z.infer<typeof UpdateMailboxRequestSchema>
export type GetMailboxesResponse = z.infer<typeof GetMailboxesResponseSchema>
export type UpdateMailboxResponse = z.infer<typeof UpdateMailboxResponseSchema>
export type CreateMailboxResponse = z.infer<typeof CreateMailboxResponseSchema>
