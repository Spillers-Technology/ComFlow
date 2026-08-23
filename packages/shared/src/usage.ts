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
  // Outbound is opt-in and operator-approved, so it is not part of any plan
  // band — it is a per-tenant grant that survives upgrades and downgrades.
  // Defaults false: a new tenant must ask, and an operator must agree.
  outboundEnabled: z.boolean().default(false),
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
    // Owner-only in practice: the route is already owner-gated, and this is the
    // switch flipped after the approval call.
    outboundEnabled: z.boolean().optional(),
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  })

export const GetUsageResponseSchema = z.object({ summary: UsageSummarySchema })
export const TenantLimitsResponseSchema = z.object({
  limits: TenantLimitsSchema,
})

export type UsageType = z.infer<typeof UsageTypeSchema>
export type UsageLine = z.infer<typeof UsageLineSchema>
export type TenantLimits = z.infer<typeof TenantLimitsSchema>
export type UsageSummary = z.infer<typeof UsageSummarySchema>
export type UpdateTenantLimitsRequest = z.infer<
  typeof UpdateTenantLimitsRequestSchema
>
export type GetUsageResponse = z.infer<typeof GetUsageResponseSchema>
export type TenantLimitsResponse = z.infer<typeof TenantLimitsResponseSchema>
