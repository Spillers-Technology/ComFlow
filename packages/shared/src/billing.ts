import { z } from 'zod'

// A tenant's prepaid wallet. balanceCents = creditCents - billedCents; usage
// draws it down, Stripe top-ups/subscriptions credit it.
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

// Owner-only support actions. Both are audited; neither is reachable by an
// org-admin managing their own tenant.
export const WalletAdjustmentRequestSchema = z.object({
  // Negative claws credit back. Whole cents.
  amountCents: z.number().int().refine(v => v !== 0, 'Enter a non-zero amount.'),
  reason: z.string().trim().min(3).max(500),
})

export const RefundRequestSchema = z.object({
  // From the Stripe dashboard — ComFlow does not persist charge ids.
  chargeId: z.string().trim().min(1),
  // Omit to refund the charge in full.
  amountCents: z.number().int().positive().optional(),
  reason: z.string().trim().min(3).max(500),
})

export const RefundResponseSchema = z.object({
  refundId: z.string(),
  amountCents: z.number().int(),
})

export type WalletAdjustmentRequest = z.infer<
  typeof WalletAdjustmentRequestSchema
>
export type RefundRequest = z.infer<typeof RefundRequestSchema>
export type RefundResponse = z.infer<typeof RefundResponseSchema>
