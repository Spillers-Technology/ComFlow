# ComFlow

**Turn missed calls into finished work.** ComFlow answers your voicemail line
over SIP, transcribes and structures every message with AI, gives your team one
golden inbox to triage, and pushes the calls worth acting on into
[AnchorDesk](https://github.com/spilloid/AnchorDesk) as tickets.

[![Release](https://img.shields.io/github/v/release/Spillers-Technology/ComFlow)](https://github.com/Spillers-Technology/ComFlow/releases/latest)
[![Container image](https://img.shields.io/badge/ghcr.io-spillers--technology%2Fcomflow-blue?logo=docker)](https://github.com/Spillers-Technology/ComFlow/pkgs/container/comflow)
[![CI](https://github.com/Spillers-Technology/ComFlow/actions/workflows/nodejs-ci.yml/badge.svg)](https://github.com/Spillers-Technology/ComFlow/actions/workflows/nodejs-ci.yml)

![ComFlow inbox — voicemails transcribed, extracted, and triaged](docs/assets/screenshots/comflow-inbox.jpg)

Every voicemail arrives already worked: **who called, from what company, what
they want, how urgent it is, and the number to call back** — with the full
transcript and recording one click away. Nothing gets lost on a handset, and
nobody types up messages by hand.

ComFlow is a **voicemail regulator**, deliberately **not** an AI receptionist.
It never fakes a conversation with your callers — it receives, processes,
presents, and integrates, and stays in that lane. (For full conversational
call-handling, use [agentvoiceresponse](https://github.com/agentvoiceresponse).)

Run it two ways: **bring your own SIP trunk and self-host** for a single team
(open or local-auth, nothing else required), or **run it as a multi-tenant
service** for others — provision phone numbers on demand, meter usage, and bill
each customer on a monthly Stripe subscription with wallet-funded overage, behind
a hard tenant boundary. See
[Hosting it for others](#hosting-it-for-others-saas).

More screenshots (call detail, scheduled outbound, DID provisioning, billing,
tenants) are on the [project page](https://spillers-technology.github.io/ComFlow/).

## Get it

Every release ships as a single container image on GitHub Container Registry —
the Express API and the built React UI, served together on port 3001:

```bash
docker pull ghcr.io/spillers-technology/comflow:latest
docker run -d --name comflow -p 3001:3001 -v comflow-data:/data \
  ghcr.io/spillers-technology/comflow:latest
```

Open <http://localhost:3001>. Persistent state (SQLite + recordings) lives in
the `/data` volume. Releases are tagged `X.Y.Z` / `X.Y`; `latest` tracks the
newest release, while `main` tracks the development branch.
Configure providers (STT/LLM keys, SIP, auth) via env vars — see
[Configuration](#configuration). Out of the box it runs with `fake` telephony
and AI providers, so you can click around before wiring anything up.

## How it works

```
SIP source ──SIP/RTP──▶ baresip (SIP edge) ──ctrl_tcp──▶ ComFlow backend
                          │ records WAV                     │ STT → LLM extract
                          ▼ shared /data volume ───────────▶ inbox (React)
                                                             └─(on review)─▶ AnchorDesk
```

- **Receive** — a real SIP user-agent ([baresip](https://github.com/baresip/baresip),
  BSD-3-Clause) registers to your SIP source, answers calls, plays a greeting,
  and records the voicemail. ComFlow writes **no** SIP/RTP code; it drives
  baresip over its `ctrl_tcp` control interface. A `fake` webhook mode is used
  for local dev and tests.
- **Process** — recordings are transcribed (STT) and structured by an LLM:
  caller, company, callback number, intent, urgency, summary.
- **Present** — a React inbox with triage, search, transcript, playback, notes.
- **Integrate** — reviewing/assigning a voicemail pushes it to AnchorDesk as a
  ticket (transcript → description, urgency → priority, recording → attachment).

## Features

**Capture & triage**

- **SIP voicemail capture** via baresip (or `fake` webhooks for dev).
- **Pluggable STT/LLM** providers: `fake`, OpenAI, Anthropic, ElevenLabs.
- **Golden single inbox**: list + detail, badges, search, "new" emphasis, light
  polling, notes, editable metadata.
- **AnchorDesk sync** of reviewed ("gilded") voicemails as tickets.
- **Scheduled outbound calls** (tight scope): place a call at a chosen time,
  play a pre-generated message, ask one question, best-effort capture the
  spoken answer. No conversation, no answering-machine detection.
- **Bring-your-own audio**: upload pre-recorded greetings (inbound) and
  message/question audio (outbound) instead of using TTS.

**Teams & access**

- **Accounts, SSO & teams**: first-class local auth (open by default) plus
  OIDC/SAML SSO; admins manage users, multiple mailboxes/DIDs, and groups that
  grant per-mailbox visibility — all under Settings and Access.
- **Self-service profile + API keys**: signed-in users can edit their profile,
  change local passwords, and create/revoke `cf_` API keys for automation.
- **Hosted MCP endpoint**: `/api/mcp` exposes ComFlow tools and recording
  resources over MCP Streamable HTTP, authenticated by the same `cf_` keys and
  scoped to the key owner's role and mailbox grants.

**Hosted mode (SaaS)**

- **Multi-tenant**: a hard `tenant_id` boundary isolates every customer's
  users, mailboxes, DIDs, and voicemails. A platform `owner` manages tenants
  and plans; each tenant has its own `admin`.
- **Optional public signup**: hosted operators can enable an email-verified
  self-registration flow that atomically creates a finite `solo` tenant and its
  first admin. Signup stays off for self-hosted installs unless explicitly enabled.
- **On-the-fly DID provisioning**: order numbers from a SIP trunk provider
  (VoIP.ms) over its API and bind them to a tenant's mailbox — forward your line
  to the DID and it answers. A `fake` provider backs dev/tests.
- **Guided call forwarding**: after provisioning, customers choose missed-call
  or all-call forwarding and get carrier-specific dial codes, QR codes,
  tap-to-dial links, deactivation instructions, and a copy-to-dial fallback.
- **Banded subscriptions + prepaid wallet**: customers subscribe to a plan band
  (Solo $9 / Pro $29 / Business $79) that sets their numbers, included minutes,
  and concurrent calls; usage past the included minutes draws a prepaid Stripe
  wallet at transparent carrier-vs-charged pricing. Plan changes and cancellation
  go through Stripe's hosted billing portal. Per-tenant limits and trunk concurrency
  caps included.

## Running from source

```bash
npm install
cp .env.example .env
npm run seed          # optional demo data
npm run dev           # backend (:3001) + frontend (:5173)
```

Or the dev stack in Docker (`fake` telephony by default):

```bash
docker compose up --build
```

To run with the real SIP edge, copy `infra/baresip/accounts.example` to
`infra/baresip/accounts`, fill in your SIP source, then:

```bash
COMFLOW_TELEPHONY=baresip docker compose --profile sip up --build
```

> SIP/RTP need reachable UDP and NAT handling — that is baresip configuration,
> see [infra/baresip/README.md](infra/baresip/README.md). ComFlow itself stays
> telephony-protocol-free.

For a production-ish local smoke test before Kubernetes, use the standalone SIP
sample. By default it uses `infra/baresip/accounts.example`, which is enough to
prove the ComFlow container can start and connect to baresip's `ctrl_tcp`
interface, but it will not register a usable phone line:

```bash
docker compose -f docker-compose.sip.sample.yml up --build
```

For a real local SIP test, create the ignored credentials file and point the
sample at it:

```bash
cp infra/baresip/accounts.example infra/baresip/accounts
# edit infra/baresip/accounts with your provider/PBX registration
BARESIP_ACCOUNTS_FILE=./infra/baresip/accounts docker compose -f docker-compose.sip.sample.yml up --build
```

The sample exposes the app at <http://localhost:3001> and publishes
`5060/udp` plus `16384-16584/udp` for RTP media.

Build + verify:

```bash
npm run build
npm test --workspace @comflow/backend
```

Screenshots are captured from the real web client with mocked API data —
regenerate them with `node docs/scripts/capture-product-media.mjs` while
`npm run dev:frontend` is running (see the header of that script for
Playwright setup).

## API surface

Open: `GET /api/health`, `POST /api/auth/login`, `POST /api/auth/register`,
`POST /api/auth/{verify-email,resend-verification}`, `GET /api/auth/me`,
`GET /api/auth/providers`, `GET /api/auth/sso/{provider}/start`,
`GET /api/auth/oidc/callback`, `POST /api/auth/saml/acs`,
`POST /api/webhooks/telephony/{inbound,recording-complete}`.

The registration endpoints return `404` unless hosted self-registration is fully
configured. Registration creates a local account, so it also requires local auth;
verification and resend endpoints are rate-limited and resend responses do not
reveal whether an address has an account.

Guarded (pass-through in open mode): `/api/calls*`, `/api/scheduled-calls*`,
`/api/prompts*`, `/api/mailboxes*`, `/api/settings/*`.

Self-service (requires auth, no admin role): `GET/PATCH /api/me`,
`POST /api/me/password`, `GET/POST/DELETE /api/me/keys*`. API key values are
shown once at creation; only metadata is stored and listed afterward.

Admin-only: `/api/groups*` (RBAC group/membership/mailbox-grant management),
`/api/users*` (local user create/role/password/delete), `/api/mailboxes` writes,
`/api/settings/*`, `/api/dids*` (search/provision/release DIDs), `/api/billing/topup`.

Tenant-scoped: `GET /api/usage` (metered usage + transparent pricing),
`GET /api/billing` (wallet). Owner-only: `/api/tenants*` (tenant/plan/limit
management, seed org-admins, freeze/unfreeze, and `GET /api/tenants/:id/audit`).
Open (machine-to-machine):
`POST /api/webhooks/stripe` (signature-verified wallet credit and subscription
state). Outbound access is requested at `/api/outbound/request` and granted by an
owner; two-factor enrollment lives under `/api/me/mfa`.

MCP: `POST /api/mcp` (Streamable HTTP) requires `Authorization: Bearer cf_...`.
Session tokens are intentionally not accepted for MCP. Tools mirror the UI:
`list_calls`, `get_call`, `update_call`, `add_note`,
`list_scheduled_call`, `create_scheduled_call`, `cancel_scheduled_call`,
`list_prompt`, `upload_prompt`, `delete_prompt`, `list_mailbox`,
`create_mailbox`, `update_mailbox`, `delete_mailbox`, `get_settings`,
`update_settings`, plus admin user/group tools. Recording files are exposed as
`comflow://recordings/{callId}` resources for calls the key owner can access.

`upload_prompt` accepts base64 audio for dependency-free clients, matching the
REST prompt upload shape. Prefer REST/browser uploads or local file references
when possible; base64 inflates payloads and is discouraged for large audio.

Inbound calls route to a mailbox by dialed DID (`toNumber` → `mailboxes.number`),
then receiving SIP account (`accountLabel` → `mailboxes.sipAccountRef`), else the
default mailbox.

## Configuration

All env vars are documented in [.env.example](.env.example). Highlights:

- **Engines**: `COMFLOW_{OPENAI,ANTHROPIC,ELEVENLABS}_API_KEY`,
  `COMFLOW_DEFAULT_{LLM,STT,TTS}_*`. The backend loads `.env` automatically
  for local runs; Docker/Kubernetes-provided env still wins. Provider
  selections and admin-entered API-key overrides persist in SQLite.
- **Mailbox**: `COMFLOW_DEFAULT_MAILBOX_{NAME,NUMBER,SIP_ACCOUNT_REF}` seeds
  the first mailbox; later edits from the Settings → Mailboxes tab persist.
- **Telephony**: `COMFLOW_TELEPHONY` (`fake`|`baresip`), `BARESIP_CTRL_*`,
  `COMFLOW_GREETING_PATH`, `COMFLOW_SIP_OUTBOUND_DOMAIN`, outbound timing.
- **AnchorDesk**: `ANCHORDESK_SYNC_ENABLED`, `ANCHORDESK_BASE_URL`,
  `ANCHORDESK_API_TOKEN`.
- **Email notifications**: `COMFLOW_EMAIL_NOTIFICATIONS_ENABLED`,
  `COMFLOW_SMTP_*`, `COMFLOW_NOTIFICATION_EMAIL_{FROM,TO}`. Defaults are
  local-Postfix friendly (`127.0.0.1:25`, no auth/TLS unless configured).
- **Auth**: `COMFLOW_AUTH_REQUIRED` (default `false`), `AUTH_SESSION_SECRET`/TTL,
  `COMFLOW_BOOTSTRAP_ADMIN_{EMAIL,PASSWORD}`, `AUTH_LOCAL_ENABLED`,
  `AUTH_ADMIN_EMAILS` (promote-to-admin-on-SSO-login allowlist).
- **Public self-registration**: `COMFLOW_SELF_REGISTRATION=true` enables the
  hosted signup flow only when required auth, local accounts, and email
  notifications are also enabled. `COMFLOW_SELF_REGISTRATION_PLAN=solo`,
  `COMFLOW_SELF_REGISTRATION_{MAX_DIDS,MAX_CONCURRENT,INCLUDED_MINUTES,MARKUP_BPS}`,
  `COMFLOW_SELF_REGISTRATION_MAX_LIFETIME_CREDIT_CENTS`, and
  `COMFLOW_EMAIL_VERIFICATION_TTL_HOURS` define its finite risk envelope.
- **SSO**: OIDC via `OIDC_{ISSUER_URL,CLIENT_ID,CLIENT_SECRET,REDIRECT_URI}`
  (Authentik-aligned, auto-enabled when set) and SAML 2.0 via
  `SAML_{ENTRY_POINT,ISSUER,IDP_CERT,CALLBACK_URL}`. Both provision users on first
  login; IdP groups map onto ComFlow groups (Access page).
- **RBAC**: groups grant **mailbox visibility**. Admins see/manage every
  mailbox; members see only the calls/mailboxes their groups grant. Manage groups,
  members, mailbox grants, and SSO group mappings on the **Access** admin page.
- **MCP/API keys**: create `cf_` keys on the Profile page. MCP requests to
  `/api/mcp` act as the key owner; member keys cannot call admin settings,
  group, user, or mailbox-write tools.
- **Multi-tenant + hosted**: `COMFLOW_AUTH_REQUIRED=true` for hosted mode;
  `COMFLOW_DEFAULT_TENANT_*` names the primary tenant; `COMFLOW_DEFAULT_*` plan
  limits (`MAX_DIDS`, `MAX_CONCURRENT`, `INCLUDED_MINUTES`, `MARKUP_BPS`) and
  `COMFLOW_TRUNK_CHANNELS` seed pricing/limits; `COMFLOW_COST_*` set raw
  carrier/AI unit costs.
- **DID provisioning (VoIP.ms)**: `VOIPMS_API_USERNAME`, `VOIPMS_API_PASSWORD`,
  `VOIPMS_SUBACCOUNT` (trunk the DIDs route to), `VOIPMS_DEFAULT_STATE`. Absent
  these, a `fake` provider is used. Override with `COMFLOW_SIP_TRUNK_PROVIDER`.
- **Stripe billing**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_{SUCCESS,CANCEL}_URL`, `COMFLOW_MAX_TOPUP_CENTS`, and one Price id per
  band (`COMFLOW_STRIPE_PRICE_{SOLO,PRO,BUSINESS}`) — create the Products/Prices
  once in the Stripe dashboard, since ids differ between test and live mode. A
  restricted key needs Products, Prices, Subscriptions, and Billing Portal write
  access on top of Customers and Checkout. Stripe mode refuses
  to start without a webhook secret. Absent Stripe credentials, a `fake` billing
  provider is used; non-free tenants remain wallet-gated so hosted dry-runs still
  test the fraud boundary. `COMFLOW_BILLING_ENFORCED=true` extends that gate to
  free tenants. Self-registered tenants additionally reserve pending checkouts
  against `COMFLOW_SELF_REGISTRATION_MAX_LIFETIME_CREDIT_CENTS`; the default
  all-time settled-credit ceiling is $200 per tenant.

## Hosting it for others (SaaS)

ComFlow runs two ways: **bring your own trunk and self-host** (open or local-auth
mode, single tenant — nothing below is required), or **run it as a service** for
others. In hosted mode you can enable public signup so a customer verifies their
email, picks a plan band, subscribes, provisions a DID, and follows the guided
forwarding step without operator-created credentials.

Outbound calling is **not** part of any band. New tenants have it off; they
request it in-app with a stated use case and consent attestation, and an owner
enables it after a call. Approved tenants are still bounded by per-day call and
spend ceilings and a country allow-list (NANP by default).

Self-registration does not turn fake providers into a phone service. Use the fake
billing/SIP adapters for a local dry run; a public paid deployment still needs
signed Stripe webhooks, real DID-provider credentials, a working SIP edge, SMTP,
bounded plan limits, and an operator notification recipient.

The built-in ceilings bound one self-registered tenant, not a fraudster creating
many accounts or reusing payment instruments. Pair them with edge rate limits,
Stripe Radar/3DS and payment-instrument velocity controls, and provider-side
spend/channel limits before opening registration.

Two end-to-end playbooks, with copy-paste scripts:

- [Onboard a team account](docs/runbooks/onboard-team-account.md) — a customer
  org with its own admin and isolated mailboxes/DIDs.
- [Onboard a paid forward-to user](docs/runbooks/onboard-paid-forward-to-user.md)
  — the public self-serve path plus its operator verification checklist.
- [Operate hosted fraud controls](docs/runbooks/hosted-fraud-controls.md) — wallet
  gates, chargeback freezes, audit review, alert retries, and reactivation.

Operate the platform from the owner-only **Tenants** page in the UI (onboard
orgs, set plan limits and markup, suspend/activate) or over the REST API (see
`scripts/`). Public signup is off by default and is safe to expose only after the
hosted checklist in the paid-user runbook passes.

## Security and public-repository hygiene

Never commit `.env`, SIP registration files, SQLite databases/WAL files, private
keys, provider credentials, real caller recordings, or tenant exports. The ignore
rules cover the standard local paths, but operators remain responsible for secret
management and history review. See [SECURITY.md](SECURITY.md) for private reporting
and first-response steps if something sensitive is exposed.

## Repo layout

```text
.
├─ packages/
│  ├─ shared/    # domain models + Zod schemas
│  ├─ backend/   # Express API, SQLite, providers (SIP trunk, billing), gateway
│  ├─ frontend/  # Vite + React + MUI operator UI
│  └─ mcp/       # hosted MCP endpoint (tools + recording resources)
├─ infra/baresip/  # SIP edge: Dockerfile, config, accounts (BYO credentials)
├─ scripts/        # operator scripts (provision tenants/DIDs, usage) — see runbooks
├─ docs/runbooks/  # end-to-end onboarding playbooks
├─ SECURITY.md     # private vulnerability and accidental-secret reporting
└─ docker-compose.yml
```

## Contributing

Found a sharp edge or want to add a provider? Issues and focused pull requests
are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers scope, synthetic caller
data, local checks, and what makes a useful review.

## Short version

ComFlow captures missed calls over SIP, turns them into structured, reviewable
work, and feeds the ones that matter into AnchorDesk — a focused voicemail
regulator, not a receptionist.
