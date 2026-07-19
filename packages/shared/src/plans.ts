import { z } from 'zod'

/**
 * The public pricing bands. A band is the single source of truth for what a
 * paying customer gets: it sets the monthly Stripe charge and materializes into
 * `tenant_limits` when a subscription becomes active.
 *
 * `free` is not sold — it is where tenants land before they subscribe and after
 * they cancel, so the account and its data survive a lapse in payment.
 *
 * Stripe Price IDs are deliberately *not* here. They differ between test and
 * live mode, so they come from `COMFLOW_STRIPE_PRICE_<BAND>` at runtime.
 */
export const PlanBandSchema = z.enum(['free', 'solo', 'pro', 'business'])

export const PlanDefinitionSchema = z.object({
  band: PlanBandSchema,
  name: z.string(),
  description: z.string(),
  monthlyCents: z.number().int(),
  maxDids: z.number().int(),
  maxConcurrentCalls: z.number().int(),
  /** Minutes covered by the subscription each billing period. */
  includedMinutes: z.number().int(),
  /** Basis points over carrier cost for usage past the included minutes. */
  markupBps: z.number().int(),
  /** False for `free`, which cannot be subscribed to. */
  purchasable: z.boolean(),
})

export type PlanBand = z.infer<typeof PlanBandSchema>
export type PlanDefinition = z.infer<typeof PlanDefinitionSchema>

export const PLAN_CATALOG: Record<PlanBand, PlanDefinition> = {
  free: {
    band: 'free',
    name: 'Inactive',
    description:
      'No active subscription. Existing voicemails stay readable; new calls and provisioning are paused.',
    monthlyCents: 0,
    maxDids: 0,
    maxConcurrentCalls: 0,
    includedMinutes: 0,
    markupBps: 15000,
    purchasable: false,
  },
  solo: {
    band: 'solo',
    name: 'Solo',
    description: 'One number for one person. Forward your cell and stop missing calls.',
    monthlyCents: 900,
    maxDids: 1,
    maxConcurrentCalls: 1,
    includedMinutes: 200,
    markupBps: 15000,
    purchasable: true,
  },
  pro: {
    band: 'pro',
    name: 'Pro',
    description: 'A second line and room for overlapping calls, for a small business.',
    monthlyCents: 2900,
    maxDids: 2,
    maxConcurrentCalls: 3,
    includedMinutes: 600,
    markupBps: 15000,
    purchasable: true,
  },
  business: {
    band: 'business',
    name: 'Business',
    description: 'Numbers for a team, with the whole trunk available at once.',
    monthlyCents: 7900,
    maxDids: 5,
    maxConcurrentCalls: 10,
    includedMinutes: 2000,
    markupBps: 15000,
    purchasable: true,
  },
}

export const PURCHASABLE_BANDS: PlanBand[] = (
  Object.keys(PLAN_CATALOG) as PlanBand[]
).filter(band => PLAN_CATALOG[band].purchasable)

export function planFor(band: string): PlanDefinition {
  return PLAN_CATALOG[band as PlanBand] ?? PLAN_CATALOG.free
}

/** Stripe subscription states. `active` and `trialing` grant service. */
export const SubscriptionStatusSchema = z.enum([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
])

export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>

/**
 * Whether a status should keep service on. `past_due` deliberately still does:
 * Stripe retries a failed invoice for days, and cutting a customer off on the
 * first failure punishes an expired card harder than the situation warrants.
 */
export function statusGrantsService(status: string | null): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due'
}

export const SubscriptionSchema = z.object({
  band: PlanBandSchema,
  status: SubscriptionStatusSchema.nullable(),
  stripeSubscriptionId: z.string().nullable(),
  currentPeriodStart: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
  /** True once the customer cancels; service runs to the period end. */
  cancelAtPeriodEnd: z.boolean(),
  /** Minutes used in the current period, against the band's allowance. */
  includedMinutesUsed: z.number().int(),
})

export const SubscribeRequestSchema = z.object({
  band: PlanBandSchema.refine(
    band => PLAN_CATALOG[band].purchasable,
    'That plan cannot be purchased.'
  ),
})

export const PlanCatalogResponseSchema = z.object({
  plans: z.array(PlanDefinitionSchema),
})

export const SubscriptionResponseSchema = z.object({
  subscription: SubscriptionSchema,
})

// Owner support view: the plan plus the wallet, in one call.
export const TenantSubscriptionResponseSchema = z.object({
  subscription: SubscriptionSchema,
  wallet: z.object({
    creditCents: z.number().int(),
    billedCents: z.number().int(),
    balanceCents: z.number().int(),
    plan: z.string().nullable(),
    stripeCustomerId: z.string().nullable(),
  }),
})

export const PortalResponseSchema = z.object({
  portalUrl: z.string(),
})

export type Subscription = z.infer<typeof SubscriptionSchema>
export type SubscribeRequest = z.infer<typeof SubscribeRequestSchema>
export type PlanCatalogResponse = z.infer<typeof PlanCatalogResponseSchema>
export type SubscriptionResponse = z.infer<typeof SubscriptionResponseSchema>
export type PortalResponse = z.infer<typeof PortalResponseSchema>
export type TenantSubscriptionResponse = z.infer<
  typeof TenantSubscriptionResponseSchema
>
