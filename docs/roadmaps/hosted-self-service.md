# Hosted self-service roadmap

**Status:** Proposed execution plan  
**Primary customer:** One person or very small business forwarding missed calls
to one ComFlow number  
**First-release boundary:** Inbound voicemail in the United States and Canada;
outbound calling remains operator-approved and outside the self-service promise

## Outcome

A new customer can discover ComFlow, create and recover an account, pay once,
choose a phone number, configure forwarding, place a test call, and see a
processed voicemail without an operator changing application or provider state.

The target is a verified first voicemail within 10 minutes for at least 80% of
invite-beta customers. Support is allowed; invisible manual provisioning is not.

## What exists today

The v4.0.0 application already implements the shape of the journey:

- public registration, email verification, a finite `solo` tenant, and an admin;
- Stripe prepaid-wallet checkout and signed, idempotent webhook handling;
- VoIP.ms number search and provisioning with tenant and funding gates;
- carrier-aware forwarding guidance with QR, tap-to-dial, copy, and manual paths;
- tenant isolation, audit rows, spend ceilings, dispute suspension, and alerts;
- the inbound SIP-to-recording-to-transcription-to-inbox product loop.

That is application evidence, not hosted-service evidence. The current automated
tests use fake providers. Public signup should remain closed until real Stripe,
real SIP, recovery, restore, and abuse controls pass the gates below.

The draft `subscriptions-mfa-sip-edge` work contains useful pieces—subscription
lifecycle, password reset, TOTP, operator support controls, and outbound
guardrails—but it is too broad to be treated as one release unit. Its current
production-readiness blockers remain authoritative until the work is split and
independently verified.

## Product contract to settle first

These are product-owner decisions, not implementation details:

1. **One charge to start.** A paid subscription should grant the plan's DID and
   included minutes. Do not require a second wallet payment before the customer
   can prove the service works. Keep the wallet for explicit overage funding or
   replace it with a deliberate overage policy.
2. **Solo and inbound first.** Sell one number and voicemail capture first.
   Teams, SSO, MCP, scheduled outbound calls, and AnchorDesk configuration may
   remain available, but they are not part of the first self-service promise.
3. **Geographic boundary.** Start with US/Canada numbers and the carriers for
   which forwarding behavior has been tested. Show an honest manual fallback for
   unsupported carriers; do not infer carrier behavior from a phone number.
4. **Data contract.** Set and publish recording/transcript retention, export,
   deletion, cancellation, refund, and post-cancellation access behavior.
5. **Rights and trust.** Resolve the repository's no-license/"open source"
   contradiction before public beta. Publish privacy, terms, support, security
   reporting, and subprocessors appropriate for a service handling recordings.
   Qualified legal review is external to this engineering roadmap.

## Milestones

### M0 — Freeze the offer and split the release work

**Goal:** Make the smallest sellable promise explicit and turn the broad draft
into reviewable, reversible changes.

- Decide the five product-contract items above and encode the selected Solo plan
  once, rather than duplicating limits across registration and billing config.
- Split the draft work into independent changes: authentication recovery/MFA;
  subscription and billing lifecycle; inbound SIP enforcement; operator support;
  and optional outbound controls.
- Keep outbound disabled for every self-registered tenant. It must not block the
  inbound launch.
- Remove the orphaned root `backend/` and `frontend/` prototype after confirming
  no build, deployment, or documentation path consumes them.
- Close or explicitly accept every high/critical dependency finding; record
  owner, rationale, compensating control, and revisit date for any acceptance.

**Exit evidence:** The deployable branch contains no unrelated mega-diff; every
change has a bounded rollback and its own tests. No high/critical finding is
silently carried into the beta.

#### PR #11 decomposition map

PR #11 must be replaced by bounded branches rather than merged and then cleaned
up. Several units touch `db/client.ts`, `app.ts`, the frontend API client, and the
backend test runner; those are integration seams, not a reason to recombine the
features.

| Order | Unit | Includes | Explicitly excludes | Merge gate |
|---|---|---|---|---|
| 1 | Identity recovery | Password reset, TOTP enrollment/challenge/recovery, session revocation, email-token primitives | Plans, Stripe, SIP, support/refunds, outbound | Release-container auth matrix plus adversarial token/session review |
| 2 | Subscription lifecycle | Plan catalog, Stripe Checkout/Portal/webhooks, durable pending-checkout guard, subscription state and limits | Mandatory second wallet payment, support/refunds, SIP packaging, outbound | Complete Stripe test lifecycle and exact reconciliation |
| 3 | Inbound service enforcement | Subscription grants DID, included allowance grants first DID, real SIP-edge image/config, inbound duration/concurrency enforcement | Scheduled outbound and outbound access requests | Three real disposable signup-to-first-voicemail runs |
| 4 | Customer lifecycle and operator support | Billing diagnosis, adjustment/refund audit, cancellation, DID release, export/deletion, support signals | New plan tiers or outbound enablement | Tenant-safe lifecycle tests and rehearsed support paths |
| 5 | Outbound calling | Access request, consent record, country allow-list, spend/count/duration/concurrency enforcement | Any dependency of the inbound launch | Separate abuse/legal review and real outbound evidence; defer by default |
| 6 | Public copy and release assets | Accurate landing page, pricing, limitations, release notes, image publication | Claims for any unshipped unit | Documentation-freshness check against the tagged release |

The old draft remains useful as a source artifact until each retained hunk has a
reviewed destination. Close it only after the replacement PRs link back to this
map and abandoned code is named explicitly; do not let “split” become an
unreviewed copy of the same change across several branches.

The release-container recovery drill found that ComFlow did not exit inside a
10-second SIGTERM grace period and was killed. The bounded shutdown fix stops
schedulers and SIP reconnects, drains HTTP, checkpoints/closes SQLite, and has
both a spawned-server SIGTERM regression and a Node 20 release-container
exit-0/integrity proof. This closes the observed process-exit defect; it does
not substitute for the later backup/restore or live in-flight SIP drills.

### M1 — Prove account and money lifecycle in Stripe test mode

**Goal:** A customer can start, recover, change, and stop service without an
operator editing SQLite or the Stripe Dashboard.

- Verify registration, email delivery, verification, password reset, TOTP
  enrollment, recovery, session revocation, and non-enumerating responses against
  the release container.
- Exercise Stripe test-mode create, webhook replay, renewal, plan change,
  payment failure, grace period, cancellation-at-period-end, reactivation, and
  Billing Portal flows.
- Prevent duplicate or concurrent subscription Checkout sessions durably.
- Reconcile Stripe customer/subscription state into ComFlow after a missed or
  delayed webhook; alert on states that cannot be mapped to a tenant.
- Change onboarding so the subscription's included allowance unlocks the first
  DID without a second prepayment, or document and usability-test a different
  operator-approved policy.
- Make all prices, included usage, overage behavior, taxes, and cancellation
  timing visible before Checkout.

**Exit evidence:** A disposable customer completes and reverses every lifecycle
path from the UI; the resulting Stripe and ComFlow records reconcile exactly;
replayed events do not duplicate money or service.

### M2 — Prove the real first-voicemail journey

**Goal:** Replace fake-provider confidence with end-to-end behavior.

- Deploy the reviewed application and SIP-edge images to a non-production
  environment using encrypted secrets and verified image digests.
- Search, order, bind, call, release, and re-order a real DID through the normal
  UI. Prove failure cleanup when provider ordering succeeds but local persistence
  fails, and the reverse.
- Enforce inbound duration and concurrency at the telephony boundary—not only in
  configuration or application bookkeeping.
- Add an onboarding readiness check covering subscription, DID routing, SIP
  registration, AI providers, notification delivery, and wallet/allowance state.
- Turn “place a test call” into a visible completion step: identify the expected
  DID, wait for the matching call, and confirm recording, transcription,
  extraction, inbox visibility, notification, and usage accounting.
- Test supported carrier forwarding on real devices and retain the manual path
  where QR/MMI links cannot work.

**Exit evidence:** Three fresh disposable accounts complete signup-to-first-
voicemail from release containers with no database, provider-dashboard, or
operator provisioning changes. Failed steps explain the recovery action without
exposing internal topology.

### M3 — Make one operator able to run it safely

**Goal:** Normal failures are observable and recoverable without heroics.

- Perform an application-consistent backup and restore drill covering SQLite,
  WAL state, recordings, prompts, greetings, and the restored app's provider
  reconciliation. Record recovery time and data-loss bounds.
- Add tenant-safe structured logs and metrics for signup, email, Checkout,
  webhook lag/failure, DID lifecycle, SIP registration, call completion,
  transcription failure, queue depth, balance/allowance, and provider spend.
- Alert on cross-system mismatches, spend/channel thresholds, repeated signup,
  disputes, depleted allowance, provider failures, and backup failures.
- Provide customer-visible retry and support paths. Define support hours,
  incident ownership, status communication, and the stop-registration switch.
- Implement self-service cancellation, DID release, data export, and account/data
  deletion with deliberate retention and cooling-off rules.
- Test tenant isolation across every recording, transcript, API, MCP resource,
  audit, notification, export, and deletion path.

**Exit evidence:** A clean environment is restored from backup and processes a
new real voicemail; an operator can find and resolve each rehearsed failure from
documented signals without querying the database ad hoc.

### M4 — Invite-only customer proof

**Goal:** Learn from real human behavior with bounded exposure.

- Admit 3–5 customers individually. Keep general registration closed.
- Observe the journey without taking it over. Record where customers hesitate,
  abandon, contact support, or accidentally configure all-call forwarding.
- Review provider cost, revenue, webhook reconciliation, false fraud freezes,
  call quality, transcription quality, notification reliability, and support
  time at least daily during the cohort.
- Fix any path that requires routine operator intervention before adding more
  customers.

**Exit evidence:** At least four of five customers reach a verified first
voicemail in 10 minutes without hidden operator changes; no tenant isolation,
billing correctness, unrecoverable-data, or uncontrolled-spend incident occurs;
and routine support fits the single-operator budget.

### M5 — Limited open beta, then general availability

**Goal:** Open only as far as the operating evidence supports.

- Put durable edge-level rate limiting, bot friction, Stripe Radar/3DS,
  payment-instrument velocity controls, and provider-side spend/channel caps in
  front of application-level tenant limits.
- Load-test signup bursts, webhooks, simultaneous inbound calls, processing
  queues, and tenant isolation at the intended beta cap.
- Publish accurate pricing, lifecycle terms, data handling, support, service
  status, known geographic/carrier limitations, and release notes.
- Start with an explicit customer/concurrency ceiling and a kill switch. Raise
  the ceiling only after cost, reliability, and support metrics remain healthy.

**Beta exit evidence:** Two consecutive weeks meet the initial service targets,
backup restore remains current, billing/provider reconciliation has no unexplained
variance, security findings are within the recorded acceptance policy, and the
operator can sustain support. Otherwise remain invite-only.

## Release gates

| Gate | Required proof | Stop condition |
|---|---|---|
| Identity | Release-container registration, verification, reset, TOTP/recovery, revocation | Account takeover or a recovery path needs database edits |
| Billing | Full Stripe test lifecycle and reconciliation | Free service, duplicate charge/subscription, or unmapped money event |
| Telephony | Real DID plus inbound call through the deployed SIP edge | Fake adapter, unenforced duration/concurrency, or orphaned DID |
| Tenant boundary | Cross-tenant adversarial tests for all sensitive artifacts | Any recording, transcript, metadata, key, export, or notification crosses tenants |
| Data recovery | Timed restore of database and media followed by a real call | Restore is untested, inconsistent, or incompatible with the release schema |
| Abuse/cost | Edge, payment, provider, tenant, and alert controls tested together | One ordinary signup can create unbounded or undetected provider spend |
| Human journey | Invite user reaches first processed voicemail unaided | Routine setup depends on operator mutation or misleading forwarding guidance |
| Trust | License/copy decision plus privacy, terms, support, security, retention | Public claims exceed the actual service or customer data has no lifecycle |

## Metrics that decide whether to continue

- signup → verified email conversion;
- verified email → active subscription conversion;
- subscription → active DID conversion;
- active DID → first processed voicemail time and completion rate;
- percent of customers needing operator mutation (target: zero);
- support contacts and operator minutes per activated customer;
- call completion, recording, transcription, extraction, and notification success;
- billing-to-provider reconciliation variance and gross margin by tenant;
- fraud freezes, false positives, disputes, and maximum realized loss;
- backup success, tested restore age, recovery time, and data-loss window;
- deletion/export completion and retention-policy compliance.

## Recommended order and budget

For one operator using AI-assisted engineering, budget roughly 80–130 reviewed
labor hours through invite beta, plus at least two weeks of real cohort elapsed
time. External legal review, customer support time, provider approval, and passive
observation are not included.

1. M0 product decisions and PR decomposition — 8–16h.
2. M1 identity and Stripe lifecycle — 20–30h.
3. M2 real DID/SIP journey and onboarding completion — 24–40h.
4. M3 recovery, observability, support, and offboarding — 20–32h.
5. M4 beta operation, evidence review, and fixes — 8–12h engineering minimum,
   with scope driven by what customers actually do.

The smallest useful release is the inbound Solo flow. Do not hold it for teams,
SSO, MCP, AnchorDesk, or outbound expansion; do not open it merely because the UI
looks complete.
