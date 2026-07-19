import { randomUUID } from 'node:crypto'
import { BillingProvider, CheckoutSession, PaymentEvent } from './types.js'

/**
 * In-memory billing provider for dev and tests. Checkout returns a local URL and
 * does not move money; tests credit wallets by posting a synthetic webhook whose
 * body carries the tenant + amount. No signature is required.
 */
export class FakeBillingProvider implements BillingProvider {
  readonly id = 'fake'

  async ensureCustomer(input: {
    tenantId: string
    existingCustomerId: string | null
  }): Promise<string> {
    return input.existingCustomerId ?? `fake_cus_${input.tenantId}`
  }

  async createTopUpCheckout(input: {
    tenantId: string
    customerId: string
    amountCents: number
  }): Promise<CheckoutSession> {
    return {
      url: `https://fake.checkout/local?tenant=${input.tenantId}&amount=${input.amountCents}`,
    }
  }

  async createSubscriptionCheckout(input: {
    tenantId: string
    customerId: string
    band: string
    priceId: string
  }): Promise<CheckoutSession> {
    return {
      url: `https://fake.checkout/subscribe?tenant=${input.tenantId}&band=${input.band}`,
    }
  }

  async createPortalSession(input: {
    customerId: string
    returnUrl: string
  }): Promise<CheckoutSession> {
    return {
      url: `https://fake.checkout/portal?customer=${input.customerId}&return=${encodeURIComponent(input.returnUrl)}`,
    }
  }

  async refund(input: {
    chargeId: string
    amountCents?: number
  }): Promise<{ id: string; amountCents: number }> {
    return {
      id: `fake_re_${input.chargeId}`,
      amountCents: input.amountCents ?? 0,
    }
  }

  async parseWebhook(input: {
    rawBody: Buffer | string
    signature: string | undefined
  }): Promise<PaymentEvent | null> {
    void input.signature
    const body = JSON.parse(
      typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString()
    ) as {
      type?: string
      tenantId?: string
      amountCents?: number
      id?: string
      subscription?: {
        stripeSubscriptionId: string
        status: string
        band: string | null
        currentPeriodStart: string | null
        currentPeriodEnd: string | null
        cancelAtPeriodEnd: boolean
      }
    }

    if (!body.tenantId) return null

    if (body.type === 'subscription_updated' && body.subscription) {
      return {
        id: body.id ?? randomUUID(),
        type: 'subscription_updated',
        tenantId: body.tenantId,
        subscription: body.subscription,
      }
    }

    if (body.type === 'subscription_payment_failed') {
      return {
        id: body.id ?? randomUUID(),
        type: 'subscription_payment_failed',
        tenantId: body.tenantId,
      }
    }

    if (body.type === 'payment_succeeded' && body.amountCents) {
      return {
        id: body.id ?? randomUUID(),
        type: 'payment_succeeded',
        tenantId: body.tenantId,
        amountCents: body.amountCents,
      }
    }

    if (body.type === 'payment_disputed') {
      return {
        id: body.id ?? randomUUID(),
        type: 'payment_disputed',
        tenantId: body.tenantId,
        amountCents: body.amountCents ?? 0,
      }
    }

    return null
  }
}
