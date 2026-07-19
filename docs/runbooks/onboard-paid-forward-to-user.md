# Runbook: Onboard a paid forward-to user

This is the hosted self-serve path for a single user with an isolated `solo`
tenant, a prepaid wallet, one forward-to DID, and guided call-forwarding setup.
The operator verifies controls; they do not create the customer account.

## Release gate

Do not expose public registration until all of these are true:

- `COMFLOW_AUTH_REQUIRED=true` and `AUTH_LOCAL_ENABLED=true`.
- `COMFLOW_SELF_REGISTRATION=true` and
  `COMFLOW_SELF_REGISTRATION_PLAN=solo`.
- SMTP delivery works, `COMFLOW_EMAIL_NOTIFICATIONS_ENABLED=true`,
  `COMFLOW_PUBLIC_URL` points at the public app, and at least one
  `COMFLOW_NOTIFICATION_EMAIL_TO` recipient receives fraud alerts.
- The `COMFLOW_SELF_REGISTRATION_*` limits are finite. The recommended starting
  envelope is one DID, two concurrent calls, and a $200 all-time settled-credit
  ceiling (`COMFLOW_SELF_REGISTRATION_MAX_LIFETIME_CREDIT_CENTS=20000`).
- Wallet enforcement is on. A non-free `solo` tenant is enforced even with the
  fake adapter; set `COMFLOW_BILLING_ENFORCED=true` explicitly for a hosted dry run.
- For a real service, Stripe has both its secret key and webhook signing secret,
  and its webhook targets `POST /api/webhooks/stripe`.
- For a real phone number, the DID provider and SIP edge are configured. Fake
  billing, fake DID provisioning, and fake telephony prove application flow only.
- The checks in [Hosted fraud controls](hosted-fraud-controls.md) pass against a
  disposable tenant.

Example hosted configuration is documented in the repository's `.env.example`.
Keep every real credential outside Git and inject it through the deployment's
secret manager.

## Customer flow

### 1. Create the account

The customer opens `/register` and submits their email, password, name, and
optional organization. ComFlow atomically creates:

- one `solo` tenant with materialized finite limits;
- one local tenant-admin account; and
- an audit entry for the registration.

Duplicate email addresses are rejected case-insensitively. Public registration is
rate-limited and remains off unless the full hosted configuration is ready.

### 2. Verify the email address

ComFlow emails a time-limited link to `/verify-email?token=...`. Until it is used,
the customer cannot add funds or provision a DID. Tokens are stored as hashes,
expire, and are replaced when a new link is requested. The resend endpoint always
returns the same response so it does not reveal which addresses have accounts.

If delivery fails, fix SMTP and use the resend flow. Do not bypass verification or
mark the account verified directly in SQLite.

### 3. Fund the prepaid wallet

The onboarding page opens Checkout. A completed Checkout session credits nothing
unless the payment is confirmed paid; supported asynchronous payment success is
handled separately. Replayed provider events are idempotent.

For a fake-provider dry run, post a unique synthetic settled event only after the
email-verification step:

```bash
curl -sS -X POST "$COMFLOW_URL/api/webhooks/stripe" \
  -H 'Content-Type: application/json' \
  -d '{"id":"evt_dry_run_unique","type":"payment_succeeded","tenantId":"<tenant-id>","amountCents":2000}'
```

Never expose the fake billing webhook on an Internet-facing deployment. Real
Stripe mode refuses unsigned or incorrectly signed events.

### 4. Provision the ComFlow DID

After settled funds appear, the customer searches for a number and provisions it
from the onboarding page. ComFlow enforces the tenant's DID cap and wallet before
ordering. The new DID is bound to that tenant's mailbox.

### 5. Configure call forwarding

The forwarding step offers carrier-specific instructions:

- **Missed calls** is recommended so the original phone still rings.
- **All calls** is opt-in and warns that the original phone stops ringing.
- QR and tap-to-dial are best-effort because some phones block MMI/star codes.
- The exact dial string is always copyable, and deactivation instructions stay
  visible beside activation instructions.

The customer should confirm the carrier's current forwarding behavior, apply the
code on the phone being forwarded, and place a missed-call test. ComFlow cannot
remotely change the customer's carrier settings.

### 6. Verify the first call

Confirm that the call reaches the provisioned DID, appears only in the customer's
tenant, is recorded/transcribed with the configured providers, and draws down the
wallet as expected. A QR code rendering successfully is not proof that real SIP or
carrier forwarding works.

## Operator acceptance checklist

Using an owner API key, inspect the disposable tenant:

```bash
export COMFLOW_URL=https://comflow.example.com
export COMFLOW_TOKEN=cf_<owner-key>

curl -sS "$COMFLOW_URL/api/tenants/<tenant-id>/limits" \
  -H "Authorization: Bearer $COMFLOW_TOKEN"
curl -sS "$COMFLOW_URL/api/tenants/<tenant-id>/audit" \
  -H "Authorization: Bearer $COMFLOW_TOKEN"
```

Verify all of the following before opening registration:

1. Registration created exactly one tenant/admin/limit/audit set.
2. An unverified account cannot top up or provision a DID.
3. A zero-balance `solo` tenant cannot provision a DID.
4. Parallel checkout attempts reserve capacity and cannot exceed the configured
   all-time settled-credit ceiling; expired/failed reservations release capacity.
5. Settled fake funds unlock one DID, and a second DID is rejected at the cap.
6. A fake dispute suspends the tenant, creates an audit row, and delivers the
   operator alert; replaying the same event does not duplicate the action.
7. The suspended tenant cannot provision or top up, and real telephony does not
   accept or originate paid calls for it.
8. Manual reactivation creates an unfreeze audit row.

Keep public signup disabled if any item fails.

## Ongoing operator work

- Review wallet, usage, plan limits, status, and the owner-only tenant audit feed.
- Investigate every automatic freeze before reactivation.
- Retry/repair failed billing-alert delivery; never treat a swallowed email error
  as an acceptable fraud control.
- Use `scripts/set-tenant-plan.mjs` for deliberate limit changes and record why.
- Recalculate the maximum credible loss whenever top-up, provider pricing,
  concurrency, DID limits, or dispute handling changes.
