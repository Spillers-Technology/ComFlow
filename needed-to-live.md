# Needed to live

Everything standing between ComFlow today and taking money from a friend.
Written 2026-07-19. Ordered — the sequence matters in one place, called out below.

## Where things stand

| | |
|---|---|
| ComFlow code | [PR #11](https://github.com/Spillers-Technology/ComFlow/pull/11), branch `feat/subscriptions-mfa-sip-edge`, **not merged** |
| Cluster manifests | [PR #20](https://github.com/spilloid/HomeLab_ac/pull/20), branch `feat/comflow-sip-edge`, **not merged** |
| Tests | 34 backend cases green |
| Production right now | image `3.0.0`, `COMFLOW_TELEPHONY=fake` — **cannot make or receive a call**, and signup is off |

Built and tested: banded subscriptions ($9/$29/$79), Stripe billing portal,
TOTP MFA, password reset, session revocation, outbound opt-in gating with daily
caps, owner refund/wallet tools, the baresip SIP edge, and a rewritten marketing
site.

---

## ⚠️ The one ordering hazard

**Merging PR #20 before the `4.1.0` images exist replaces a working site with
`ImagePullBackOff`.** Flux reconciles `main` every 10 minutes, and
`ghcr.io/spillers-technology/comflow-baresip` has *never been published* — the
job that builds it is new in PR #11.

Correct order: **merge #11 → tag `v4.1.0` → wait for both images → merge #20.**

---

## 1. Rotate the exposed keys

Two untracked files in the ComFlow working tree hold live credentials in
plaintext. They were never committed and are gitignored, so nothing leaked to
git history — but they are sitting on disk.

- `ComFlow/env` — a live Stripe restricted key (`rk_live_…`)
- `ComFlow/.env` — live OpenAI (`sk-proj-HiOH…`) and ElevenLabs keys

Rotate all three in their dashboards, then delete the stray `env` file (`.env`
is the real one). Note the OpenAI key here is **not** the one now wired into the
cluster — that one came from AVR and is different.

## 2. Widen the Stripe key scope

The `rk_live_` key is *restricted*. It was scoped for wallet top-ups, which only
needed Customers and Checkout. Subscriptions additionally need write access to:

- **Products**
- **Prices**
- **Subscriptions**
- **Billing Portal**

Mint a new key with those (you are rotating anyway) — the code will fail against
the current scope.

## 3. Create the Stripe Products and Prices

Three recurring monthly prices, matching `packages/shared/src/plans.ts` exactly:

| Band | Price | Numbers | Included minutes | Concurrent |
|---|---:|---:|---:|---:|
| Solo | $9/mo | 1 | 200 | 1 |
| Pro | $29/mo | 2 | 600 | 3 |
| Business | $79/mo | 5 | 2,000 | 10 |

Record the three price ids (`price_…`). They differ between test and live mode,
which is why they are env config and not in the catalog.

**Do this in test mode first** and run the flow end to end before touching live.

## 4. Fill the remaining secrets

```bash
cd ../homelab_ac
export SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt
sops apps/comflow/base/secret.sops.yaml
```

| Key | Status |
|---|---|
| `COMFLOW_OPENAI_API_KEY` | ✅ set — copied from AVR, covers LLM + STT + TTS |
| `COMFLOW_AUTH_SESSION_SECRET` | ✅ set, non-default (verified) |
| `OIDC_CLIENT_SECRET`, `ANCHORDESK_API_TOKEN`, `COMFLOW_NOTIFICATION_EMAIL_TO` | ✅ set |
| `VOIPMS_API_USERNAME` | ❌ **needed** |
| `VOIPMS_API_PASSWORD` | ❌ **needed** |
| `VOIPMS_SUBACCOUNT` | ❌ **needed** |
| `STRIPE_SECRET_KEY` | ❌ **needed** |
| `STRIPE_WEBHOOK_SECRET` | ❌ **needed** (from the Stripe webhook endpoint, step 6) |
| `COMFLOW_STRIPE_PRICE_SOLO` / `_PRO` / `_BUSINESS` | ❌ **needed** (step 3) |
| `COMFLOW_ANTHROPIC_API_KEY`, `COMFLOW_ELEVENLABS_API_KEY` | empty and now unreferenced — safe to delete |

AVR runs Callcentric, so there is nothing to borrow for VoIP.ms.

## 5. Turn signup and billing on

**Signup is currently off.** `COMFLOW_SELF_REGISTRATION` is not set anywhere, so
nobody can register even once the app is healthy. Add to
`apps/comflow/base/deployment.yaml`:

```yaml
- name: COMFLOW_SELF_REGISTRATION
  value: "true"
- name: COMFLOW_BILLING_PROVIDER
  value: stripe
```

The app asserts its hosted preconditions at boot and refuses to start if any are
missing. All of them are already satisfied (auth required, local auth on, SMTP
on, non-default session secret, fraud-alert recipient set), so this should come
up clean.

## 6. Point Stripe at the webhook

Endpoint: `https://com.spillerstech.us/api/webhooks/stripe`

Subscribe to: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.paid`, `invoice.payment_failed`, `charge.dispute.created`.

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. The app **refuses to
accept unverified webhooks**, so this is not optional.

The route is reachable through the Cloudflare tunnel and the ingress has no
forward-auth, so Stripe can reach it.

## 7. Network: the OPNsense NAT rule

Forward to **192.168.68.244**:

- SIP `5060/UDP`
- RTP `16384-16403/UDP`

Mirror the existing AVR rule for `.250`. Keep `rtp_ports` in
`infra/baresip/config`, `service-sip.yaml`, and this rule in sync — changing one
alone breaks audio in one direction, which is miserable to debug.

## 8. Ship it

```bash
# ComFlow
gh pr merge 11 --squash            # or review first
git checkout main && git pull
git tag v4.1.0 && git push origin v4.1.0
# wait for BOTH images: comflow:4.1.0 and comflow-baresip:4.1.0
gh run watch

# Cluster — only after the images exist
cd ../homelab_ac
gh pr merge 20 --squash
# Flux reconciles within 10 min, or: flux reconcile kustomization cluster --with-source
```

Note: `envFrom` secret edits do **not** restart the pod. The image bump covers
the first rollout; later secret-only changes need
`kubectl rollout restart deploy/comflow -n comflow`.

## 9. Configure the trunk

Admin → Settings → SIP, with the VoIP.ms sub-account registration. ComFlow
writes `/data/baresip/accounts` itself, which is why the SIP password never
enters a manifest.

## 10. Verify before selling

In order, stopping at the first failure:

1. **Real call.** Provision a DID, call it from your mobile. Confirm the
   greeting plays, the recording lands, transcription runs, and it appears in
   the inbox. *Nothing downstream matters until this works.*
2. **Stripe test mode.** Subscribe, upgrade, downgrade, let an invoice fail,
   cancel. Check `tenant_limits` follows the band each time.
3. **Stripe live.** Your own card, Solo, real subscription. Confirm the webhook
   lands, limits materialize, then cancel through the portal and confirm the
   downgrade.
4. **Outbound.** Confirm a new tenant is blocked, submit a request, approve it
   on the Tenants page, place one real call, confirm the daily cap trips.
5. **Auth.** Register → verify email → forgot password → reset → enroll TOTP →
   sign in with a code.

---

## Known gaps — read before charging

**A tenant can provision a number without subscribing.** Registration
materializes `COMFLOW_SELF_REGISTRATION_*` limits (1 DID, 200 minutes), and DID
provisioning only checks tenant status, wallet balance, and the DID cap — not
whether a subscription is active. So: register → verify → top up $5 → get a
number, never paying a monthly cent.

This cannot be closed by config: `assertConfiguration()` rejects
`COMFLOW_SELF_REGISTRATION_MAX_DIDS=0`. It needs a small code change gating
provisioning on `statusGrantsService(subscription.status)`. **I have not done
this.** It is the one thing I would fix before opening signup to anyone who
might notice.

**Other things deliberately not done:**

- No CAPTCHA, disposable-email blocking, or per-card velocity limits. The wallet
  ceiling, lifetime credit cap, verified-email gate, and dispute-freeze are
  proportionate for friends, not for open public signup.
- The outbound request emails you but does not create an AnchorDesk ticket. That
  service is coupled to `CallRecord` and generalizing it was more than this
  needed; the audit row plus email covers it.
- Backups: `docs/backup-recovery-matrix.md` lists ComFlow as "application export
  not yet defined, last tested: never." Longhorn snapshots of a live SQLite file
  are only crash-consistent. Worth a `VACUUM INTO` export before real customer
  data exists.
- Single replica is a hard constraint — `concurrencyService` is in-memory and
  SQLite is single-writer. Do not scale it up.
- ComFlow and AVR now share an OpenAI key. Rotating means rotating both.

## If it goes wrong

```bash
cd ../homelab_ac
git revert <merge-sha> && git push     # Flux rolls back within 10 min
```

Or pin the old image directly in `deployment.yaml` (`comflow:3.0.0`, and drop
the baresip sidecar) for an immediate fix. The `/data` PVC is untouched by any
of this, so voicemails and the database survive a rollback.
