import crypto from 'node:crypto'
import { BillingProvider, CheckoutSession, PaymentEvent } from './types.js'

const STRIPE_API = 'https://api.stripe.com/v1'

export type StripeConfig = {
  secretKey: string
  webhookSecret: string | null
  successUrl: string
  cancelUrl: string
}

/**
 * Stripe adapter implemented over the REST API with `fetch` and manual webhook
 * signature verification — no SDK dependency. Wallet top-ups use a one-off
 * Checkout session whose metadata carries the tenant id; the webhook credits the
 * wallet on `checkout.session.completed`. Validated in Stripe test mode per the
 * onboarding runbook; there is no automated test against the live API.
 */
export class StripeBillingProvider implements BillingProvider {
  readonly id = 'stripe'

  constructor(private readonly config: StripeConfig) {}

  private async post(
    path: string,
    form: Record<string, string>
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${STRIPE_API}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form).toString(),
    })
    const body = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const error = body.error as { message?: string } | undefined
      throw new Error(`Stripe ${path} failed: ${error?.message ?? response.status}`)
    }
    return body
  }

  async ensureCustomer(input: {
    tenantId: string
    existingCustomerId: string | null
    email?: string | null
  }): Promise<string> {
    if (input.existingCustomerId) return input.existingCustomerId
    const customer = await this.post('/customers', {
      'metadata[tenantId]': input.tenantId,
      ...(input.email ? { email: input.email } : {}),
    })
    return String(customer.id)
  }

  async createTopUpCheckout(input: {
    tenantId: string
    customerId: string
    amountCents: number
  }): Promise<CheckoutSession> {
    const session = await this.post('/checkout/sessions', {
      mode: 'payment',
      customer: input.customerId,
      success_url: this.config.successUrl,
      cancel_url: this.config.cancelUrl,
      'metadata[tenantId]': input.tenantId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(input.amountCents),
      'line_items[0][price_data][product_data][name]': 'ComFlow wallet top-up',
    })
    return { url: String(session.url) }
  }

  parseWebhook(input: {
    rawBody: Buffer | string
    signature: string | undefined
  }): PaymentEvent | null {
    const raw =
      typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString()
    this.verifySignature(raw, input.signature)

    const event = JSON.parse(raw) as {
      id: string
      type: string
      data: { object: Record<string, unknown> }
    }
    if (event.type !== 'checkout.session.completed') return null

    const object = event.data.object
    const metadata = (object.metadata ?? {}) as { tenantId?: string }
    const amountCents = Number(object.amount_total ?? 0)
    if (!metadata.tenantId || !amountCents) return null

    return {
      id: event.id,
      type: 'payment_succeeded',
      tenantId: metadata.tenantId,
      amountCents,
    }
  }

  private verifySignature(payload: string, header: string | undefined): void {
    if (!this.config.webhookSecret) return // verification disabled
    if (!header) throw new Error('Missing Stripe-Signature header.')

    const parts = Object.fromEntries(
      header.split(',').map(kv => kv.split('=') as [string, string])
    )
    const timestamp = parts.t
    const signature = parts.v1
    if (!timestamp || !signature) throw new Error('Malformed Stripe-Signature.')

    const expected = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest('hex')

    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new Error('Invalid Stripe webhook signature.')
    }
  }
}
