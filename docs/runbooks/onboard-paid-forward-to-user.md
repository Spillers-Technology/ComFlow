# Runbook: Onboard a paid forward-to user

**Case study 2.** A single user on a monthly plan with basic usage limits and one
DID to forward their calls to. They pay via Stripe; usage draws down a prepaid
wallet.

## Prerequisites

- Hosted ComFlow (`COMFLOW_AUTH_REQUIRED=true`).
- Stripe configured: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and a webhook
  endpoint pointed at `POST /api/webhooks/stripe` (event:
  `checkout.session.completed`). Use Stripe **test mode** for the dry run.
- A SIP trunk provider (`VOIPMS_*`), or the `fake` provider for a dry run.
- An **owner** `cf_` API key.

```bash
export COMFLOW_URL=https://comflow.example.com
export COMFLOW_TOKEN=cf_<owner-key>
```

## 1. Create the user's tenant + their admin login

A single paid user is just a one-person tenant where they are the org-admin.

```bash
node scripts/provision-tenant.mjs \
  --name "Dana Smith" --slug dana --plan solo \
  --admin-email dana@example.com --admin-password 'temp-password' \
  --max-dids 1 --max-concurrent 2 --included-minutes 200 --markup-bps 15000
```

`markup-bps 15000` means the customer is charged 1.5x the raw carrier/AI cost —
the transparent margin shown on their usage page.

## 2. Customer funds the wallet (Stripe)

Dana signs in, opens **Billing**, and clicks **Add funds** — or via API with
Dana's token:

```bash
export COMFLOW_TOKEN=cf_<dana-key>
curl -s -X POST "$COMFLOW_URL/api/billing/topup" \
  -H "Authorization: Bearer $COMFLOW_TOKEN" -H 'Content-Type: application/json' \
  -d '{"amountCents": 2000}'    # → { "checkoutUrl": "https://checkout.stripe.com/..." }
```

Dana completes Stripe Checkout. Stripe calls `POST /api/webhooks/stripe`; the
signature is verified and the wallet is credited **idempotently**. Confirm:

```bash
node scripts/tenant-usage.mjs    # shows wallet credit / balance
```

## 3. Provision the forward-to DID

With a funded wallet (provisioning is blocked at $0 in hosted mode):

```bash
node scripts/provision-did.mjs --search NY --mailbox-name "Dana's line"
# → Provisioned +1NXXNXXXXXX → mailbox <id>
```

Dana sets their cell/office to **forward to that DID**. Calls they miss are
answered, recorded, transcribed, and appear under Dana's sign-in only.

## 4. Ongoing

- **Usage & cost**: `node scripts/tenant-usage.mjs` (or the Billing page) shows
  minutes, AI spend, DID rental, carrier-vs-charged, and remaining balance.
- **Low balance**: usage past the balance leaves it negative; provisioning new
  paid actions is blocked until they top up again.
- **Plan change**: `node scripts/set-tenant-plan.mjs <tenantId> --included-minutes 500`
  (owner).

## Verify (dry run with fakes)

With `fake` SIP + `fake` billing and `COMFLOW_TELEPHONY=fake`:

1. Run steps 1–3 (the fake billing webhook is a plain JSON POST — see below).
2. Post a fake inbound webhook to the DID and confirm the voicemail shows only
   under Dana's tenant and that the wallet was drawn down.

```bash
# Fake billing credit (no Stripe): the fake provider accepts a plain body.
curl -s -X POST "$COMFLOW_URL/api/webhooks/stripe" \
  -H 'Content-Type: application/json' \
  -d '{"id":"evt_demo","type":"payment_succeeded","tenantId":"<dana-tenant-id>","amountCents":2000}'
```
