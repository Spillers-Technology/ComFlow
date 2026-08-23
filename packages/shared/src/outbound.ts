import { z } from 'zod'

export const OutboundAccessRequestSchema = z.object({
  useCase: z.string().trim().min(20).max(2000),
  // A number the team can call back on — the approval is a conversation.
  contactPhone: z.string().trim().min(7).max(32),
  /**
   * Explicit consent attestation. Required to be literally true: outbound
   * calling to people who have not agreed to be called is the abuse case this
   * whole gate exists to prevent, and an unchecked box is not a defence.
   */
  consentAttested: z.literal(true),
})

export const OutboundAccessResponseSchema = z.object({
  received: z.literal(true),
})

export const OutboundStatusSchema = z.object({
  enabled: z.boolean(),
  maxPerDay: z.number().int(),
  maxSpendPerDayCents: z.number().int(),
})

export type OutboundAccessRequest = z.infer<typeof OutboundAccessRequestSchema>
export type OutboundAccessResponse = z.infer<
  typeof OutboundAccessResponseSchema
>
export type OutboundStatus = z.infer<typeof OutboundStatusSchema>
