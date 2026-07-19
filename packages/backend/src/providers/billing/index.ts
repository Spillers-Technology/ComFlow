import { config } from '../../config.js'
import { FakeBillingProvider } from './fake.js'
import { StripeBillingProvider } from './stripe.js'
import { BillingProvider } from './types.js'

/**
 * Pick the billing provider from config: Stripe when its secret key is present
 * (or explicitly selected), otherwise the in-memory fake for dev/tests.
 */
export function createBillingProvider(): BillingProvider {
  const { provider, stripeSecretKey, stripeWebhookSecret, successUrl, cancelUrl } =
    config.billing
  const stripeConfigured = Boolean(stripeSecretKey)

  if (provider === 'stripe' || (provider !== 'fake' && stripeConfigured)) {
    if (!stripeConfigured) {
      throw new Error(
        'COMFLOW_BILLING_PROVIDER=stripe requires STRIPE_SECRET_KEY.'
      )
    }
    if (!stripeWebhookSecret) {
      throw new Error(
        'COMFLOW_BILLING_PROVIDER=stripe requires STRIPE_WEBHOOK_SECRET.'
      )
    }
    return new StripeBillingProvider({
      secretKey: stripeSecretKey!,
      webhookSecret: stripeWebhookSecret,
      successUrl,
      cancelUrl,
    })
  }

  return new FakeBillingProvider()
}

export type { BillingProvider } from './types.js'
