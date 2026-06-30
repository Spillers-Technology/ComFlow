# Runbook: Onboard a team account

**Case study 1.** A customer organization with its *own* org-admin who manages
their own users and sees only their own mailboxes, DIDs, and voicemails. The
platform owner provisions the tenant; the customer runs day-to-day.

## Prerequisites

- A ComFlow deployment with `COMFLOW_AUTH_REQUIRED=true` (hosted mode).
- An **owner** account and a `cf_` API key for it (Profile → API keys).
- A SIP trunk provider configured (`VOIPMS_*`) — or the `fake` provider for a dry run.

Set your shell:

```bash
export COMFLOW_URL=https://comflow.example.com
export COMFLOW_TOKEN=cf_<owner-key>
```

## 1. Create the tenant + its first org-admin

```bash
node scripts/provision-tenant.mjs \
  --name "Acme Co" --slug acme --plan team \
  --admin-email admin@acme.test --admin-password 'choose-a-strong-one' \
  --max-dids 3 --max-concurrent 5 --included-minutes 1000 --markup-bps 15000
```

This creates the tenant, sets its plan limits, and seeds an `admin` user **inside
that tenant**. (Equivalent by hand: `POST /api/tenants`, `PATCH
/api/tenants/:id/limits`, `POST /api/tenants/:id/users`.)

## 2. Hand off to the customer's org-admin

The org-admin signs in at `/login`, then:

- **Access page** — invites their teammates (`member` users), creates groups,
  and grants each group the mailboxes it should see.
- **Profile** — creates their own `cf_` API key if they want automation/MCP.

They never see other tenants; an `admin` here is scoped to Acme only.

## 3. Provision DID(s) and forward calls

Top up the wallet first (see the paid-user runbook for Stripe), then, using the
**org-admin's** token:

```bash
export COMFLOW_TOKEN=cf_<acme-org-admin-key>
node scripts/provision-did.mjs --search NY --mailbox-name "Acme main line"
```

Forward each Acme phone line to its assigned DID. Inbound calls route by dialed
DID into Acme's mailbox; voicemails are transcribed, triaged, and visible only to
Acme users their groups allow.

## 4. Verify isolation

- Sign in as an Acme member → they see only granted Acme mailboxes.
- Sign in as a *different* tenant's user → Acme's calls/mailboxes are invisible
  (the API returns 404 for direct ids, not a leak).
- `node scripts/tenant-usage.mjs` (Acme token) shows only Acme usage + wallet.

## Rollback

- Remove a DID: `DELETE /api/dids/<number>` (org-admin) — routing stops and the
  number is released at the provider.
- Suspend the tenant: `PATCH /api/tenants/:id { "status": "suspended" }` (owner).
