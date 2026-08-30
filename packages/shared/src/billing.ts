import { z } from 'zod'

// A tenant's prepaid wallet. balanceCents = creditCents - billedCents; usage
// beyond the subscription allowance draws it down and Stripe top-ups credit it.
export const WalletSchema = z.object({
  creditCents: z.number().int(),
  billedCents: z.number().int(),
  balanceCents: z.number().int(),
  plan: z.string().nullable(),
  stripeCustomerId: z.string().nullable(),
})

export const TopUpRequestSchema = z.object({
  amountCents: z.number().int().min(500).max(1000000),
})

export const CheckoutResponseSchema = z.object({
  // Where to redirect the browser to complete payment.
  checkoutUrl: z.string(),
})

export const WalletResponseSchema = z.object({
  wallet: WalletSchema,
})

export type Wallet = z.infer<typeof WalletSchema>
export type TopUpRequest = z.infer<typeof TopUpRequestSchema>
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>
export type WalletResponse = z.infer<typeof WalletResponseSchema>

// --- Subscription lifecycle (hosted self-service Unit 2) -------------------
//
// One paid plan for now ("Solo" — one number, one caller at a time, a fixed
// included-minutes allowance). A subscription's included allowance unlocks the
// plan's DID without a separate wallet payment; the wallet remains for usage
// overage once the included minutes are exhausted.

/** A sellable plan. Capacity fields mirror `TenantLimits` one-for-one. */
export const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  priceCents: z.number().int().nonnegative(),
  currency: z.literal('usd'),
  interval: z.literal('month'),
  maxDids: z.number().int().nonnegative(),
  includedMinutes: z.number().int().nonnegative(),
  maxConcurrentCalls: z.number().int().nonnegative(),
  // Usage beyond the included allowance is funded explicitly from the wallet
  // at carrier/AI cost multiplied by this basis-point value (15000 = 1.5x).
  overageMarkupBps: z.number().int().min(10000),
  taxBehavior: z.literal('exclusive'),
})

export const PlanCatalogResponseSchema = z.object({
  plans: z.array(PlanSchema),
})

export const SubscriptionStatusSchema = z.enum([
  'none',
  'incomplete',
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'canceled',
])

export const SubscriptionSchema = z.object({
  status: SubscriptionStatusSchema,
  planId: z.string().nullable(),
  currentPeriodStart: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
  gracePeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  // True for a recognized active/trialing plan, or during the bounded past-due
  // grace window. Unknown Stripe prices never grant service.
  usable: z.boolean(),
})

export const SubscriptionResponseSchema = z.object({
  subscription: SubscriptionSchema,
})

export const BillingPortalResponseSchema = z.object({
  portalUrl: z.string(),
})

export const StartSubscriptionCheckoutRequestSchema = z.object({
  planId: z.string().trim().min(1).max(64),
})

export const ChangeSubscriptionPlanRequestSchema = z.object({
  planId: z.string().trim().min(1).max(64),
})

// Portal return URLs are configured server-side. Accepting an arbitrary URL
// here would turn an authenticated endpoint into an open redirect.
export const BillingPortalRequestSchema = z.object({}).strict()

export const ReconcileSubscriptionResponseSchema = z.object({
  changed: z.boolean(),
  status: SubscriptionStatusSchema,
  subscription: SubscriptionSchema,
})

export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>
export type Plan = z.infer<typeof PlanSchema>
export type PlanCatalogResponse = z.infer<typeof PlanCatalogResponseSchema>
export type Subscription = z.infer<typeof SubscriptionSchema>
export type SubscriptionResponse = z.infer<typeof SubscriptionResponseSchema>
export type BillingPortalResponse = z.infer<typeof BillingPortalResponseSchema>
export type StartSubscriptionCheckoutRequest = z.infer<
  typeof StartSubscriptionCheckoutRequestSchema
>
export type ChangeSubscriptionPlanRequest = z.infer<
  typeof ChangeSubscriptionPlanRequestSchema
>
export type BillingPortalRequest = z.infer<typeof BillingPortalRequestSchema>
export type ReconcileSubscriptionResponse = z.infer<
  typeof ReconcileSubscriptionResponseSchema
>
