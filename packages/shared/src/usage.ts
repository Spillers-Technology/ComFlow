import { z } from 'zod'

// Billable unit types metered per tenant. Minutes are telephony; stt/llm/tts are
// per-voicemail AI costs; did_rental is the monthly number rental.
export const UsageTypeSchema = z.enum([
  'inbound_minute',
  'outbound_minute',
  'did_rental',
  'stt',
  'llm',
  'tts',
])

export const UsageLineSchema = z.object({
  type: UsageTypeSchema,
  quantity: z.number(),
  carrierCents: z.number(),
  billedCents: z.number(),
})

export const TenantLimitsSchema = z.object({
  maxConcurrentCalls: z.number().int(),
  maxDids: z.number().int(),
  includedMinutes: z.number().int(),
  markupBps: z.number().int(),
})

export const UsageSummarySchema = z.object({
  // YYYY-MM the summary covers.
  month: z.string(),
  lines: z.array(UsageLineSchema),
  totalCarrierCents: z.number(),
  totalBilledCents: z.number(),
  limits: TenantLimitsSchema,
})

export const UpdateTenantLimitsRequestSchema = z
  .object({
    maxConcurrentCalls: z.number().int().min(0).max(1000).optional(),
    maxDids: z.number().int().min(0).max(1000).optional(),
    includedMinutes: z.number().int().min(0).optional(),
    markupBps: z.number().int().min(10000).max(100000).optional(),
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  })

export type UsageType = z.infer<typeof UsageTypeSchema>
export type UsageLine = z.infer<typeof UsageLineSchema>
export type TenantLimits = z.infer<typeof TenantLimitsSchema>
export type UsageSummary = z.infer<typeof UsageSummarySchema>
export type UpdateTenantLimitsRequest = z.infer<
  typeof UpdateTenantLimitsRequestSchema
>
