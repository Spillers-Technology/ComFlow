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
