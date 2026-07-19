# Runbook: Operate hosted fraud controls

Public signup turns ComFlow into an abuse-facing telecom and billing service. This
runbook defines the operator checks required for that mode. It does not apply to a
single-team, free self-hosted installation with registration disabled.

## Control boundary

The release boundary is:

- verified local email ownership before wallet funding or DID provisioning;
- a finite, materialized `solo` plan rather than mutable global defaults;
- settled funds before paid provisioning;
- signed, idempotent Stripe events in real billing mode;
- automatic suspension on a payment dispute;
- a durable operator alert and an attributable audit trail; and
- active-tenant, wallet, DID, and concurrency checks on every paid call path.

If the live SIP edge can still answer or originate for a suspended or empty-wallet
tenant, public signup is not release-ready even when the REST API returns the right
error afterward.

## Startup configuration

At minimum, set:

```dotenv
COMFLOW_AUTH_REQUIRED=true
AUTH_LOCAL_ENABLED=true
COMFLOW_SELF_REGISTRATION=true
COMFLOW_SELF_REGISTRATION_PLAN=solo
COMFLOW_EMAIL_NOTIFICATIONS_ENABLED=true
COMFLOW_NOTIFICATION_EMAIL_TO=operator@example.com
COMFLOW_BILLING_ENFORCED=true
COMFLOW_MAX_TOPUP_CENTS=10000
COMFLOW_SELF_REGISTRATION_MAX_LIFETIME_CREDIT_CENTS=20000
COMFLOW_SELF_REGISTRATION_MAX_DIDS=1
COMFLOW_SELF_REGISTRATION_MAX_CONCURRENT=2
COMFLOW_SELF_REGISTRATION_INCLUDED_MINUTES=200
COMFLOW_SELF_REGISTRATION_MARKUP_BPS=15000
```

The values above cap one checkout at $100, all-time settled wallet credit for one
self-registered tenant at $200, and one tenant at one DID/two concurrent calls.
Checkout creation reserves capacity for 24 hours so parallel sessions cannot
sidestep the lifetime limit; an unexpectedly settled payment above the ceiling
freezes the tenant and alerts the operator. ComFlow refuses to start when signup
lacks required auth or email delivery, and Stripe mode refuses to start without a
webhook signing secret.

The tenant ceiling is not an identity, card, IP, or fleet-wide fraud ceiling. Add
edge rate limits that preserve the real client IP, Stripe Radar/3DS and payment-
instrument velocity rules, and provider-side spend/channel limits. A bad actor
creating multiple verified tenants can otherwise multiply the per-tenant envelope.

## What causes a freeze

`charge.dispute.created` resolves the Stripe customer back to a tenant and changes
that tenant to `suspended`. The same transaction records `tenant.freeze`, marks the
provider event processed, and queues the operator alert. An event that cannot be
mapped to a tenant remains retryable rather than being silently discarded.

A suspended tenant must be denied new top-ups, DID orders, inbound processing, and
outbound paid work. Keep provider-side controls available as a second containment
layer; application status alone cannot recover carrier spend already incurred.

## Triage a frozen tenant

1. Confirm the dispute in Stripe using the provider event ID from the audit entry.
2. Confirm the tenant status and review recent wallet credits, usage, DID orders,
   call activity, and plan-limit changes.
3. Disable or quarantine provider-side DIDs/trunk access if activity is ongoing.
4. Confirm the notification reached an operator. Failed delivery remains pending
   for retry and should keep webhook handling visibly unhealthy.
5. Preserve relevant audit/provider evidence without exporting caller recordings
   or tenant data into tickets or this public repository.

Read the tenant trail with an owner token:

```bash
curl -sS "$COMFLOW_URL/api/tenants/<tenant-id>/audit" \
  -H "Authorization: Bearer $COMFLOW_TOKEN"
```

Expected actions include `tenant.self_register`, verification delivery/confirmation,
`wallet.credit`, DID provision/release, `tenant.freeze`, and `tenant.unfreeze`.

## Reactivate deliberately

Only the platform owner should reactivate a tenant, after the dispute and provider
exposure are understood:

```bash
curl -sS -X PATCH "$COMFLOW_URL/api/tenants/<tenant-id>" \
  -H "Authorization: Bearer $COMFLOW_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"active"}'
```

Confirm that `tenant.unfreeze` appears in the audit feed. Reactivation does not
restore funds, close a Stripe dispute, or re-enable a provider-side quarantine.

## Maximum credible loss

Record a numeric deployment-specific estimate before enabling signup:

```text
maximum credible loss =
  disputed settled credit available to one or more abusive tenants
  + carrier and AI cost consumed before suspension takes effect
  + non-refundable DID commitments
  + concurrent calls already in progress when the wallet crosses zero
  + dispute/provider fees
  + incident-response labor
```

Use the configured DID/concurrency limits, maximum call duration, raw provider unit
costs, detection/webhook delay, and wallet/top-up controls. By default, one tenant
can settle no more than $200 over its lifetime, in one or more checkouts capped at
$100 each. The per-tenant application bound is therefore the $200 settled-credit
ceiling plus bounded work already in flight; the deployment-wide bound must also
account for how many fraudulent tenants or payment instruments can pass external
velocity controls. If no defensible numeric upper bound exists, keep signup closed
or add the missing edge, payment, and provider controls.

Recalculate after every pricing, plan, provider, webhook, or call-path change and
attach the accepted number to the private operational release record—not to public
documentation containing provider account details.
