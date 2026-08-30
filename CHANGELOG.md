# Changelog

All notable changes to ComFlow are documented in this file. Reconstructed from
`git log` and the repository's release tags; entries before v2.0.0 (the pivot
to a voicemail regulator) are summarized rather than itemized, since that
period was prototype work under a different product concept.

This is the sole changelog source for ComFlow; there are no separate
per-version `docs/releases/` notes.

## [Unreleased]

Work merged to `main` since the v4.0.0 tag:

- Fixed a graceful-shutdown bug: services and the SQLite connection now drain
  cleanly on shutdown instead of terminating abruptly.
- Remediated `npm audit` findings across the dependency tree.
- Typed baresip `ctrl_tcp` control events safely instead of loosely.
- Split and landed the reviewable parts of the draft PR #11 work; removed
  leftover prototype code.
- Marked shipped self-serve onboarding roadmap items ("Verified self-serve
  signup", "Guided call forwarding") `Done` on the landing page, and published
  the hosted self-service roadmap doc.
- Documented the current release version in the README.
- Added `LICENSE` (MIT), `license` fields to `package.json` across all
  workspaces, and a `CHANGELOG.md` (this file); aligned README/landing-page/
  `CONTRIBUTING.md` licensing language with the MIT decision.

## [4.0.0] - 2026-07-19

- Added self-registration: public signup, email verification, and an
  atomically-created finite `solo` tenant with its own admin.
- Added on-the-fly DID provisioning, QR-code and tap-to-dial guided call
  forwarding, and hosted fraud controls (spend ceilings, dispute suspension,
  alerts) for the self-service signup path.
- Changed `:latest` container publishing to fire only on release tags, not
  every push to `main`.
- Added a contributor on-ramp to the README and a screenshot lightbox to the
  landing page.
- Linked the landing page back to spillerstech.us and added an `og:url` /
  Spillers Technology footer credit.

## [3.0.0] - 2026-06-29

- Added multi-tenant SaaS support: a hard `tenant_id` boundary isolating each
  customer's users, mailboxes, DIDs, and voicemails.
- Added on-the-fly DID provisioning via a SIP trunk provider (VoIP.ms).
- Added usage metering, per-tenant plan limits, and trunk concurrency caps.
- Added Stripe prepaid-wallet billing, including an idempotent sweep to charge
  DID monthly rental against the wallet.
- Added the multi-tenant SaaS frontend surfaces (owner Tenants page, plan/
  limit management).
- Added operator runbooks and scripts for onboarding team accounts and paid
  forward-to users.
- Refreshed documentation for multi-tenant, DIDs, wallet, and the hosted
  pitch.

## [2.3.0] - 2026-06-27

- Release tag only; consolidates the SSO/RBAC work below ahead of the 3.0.0
  multi-tenant milestone.

## [2.2.0] - 2026-06-27

- Added SSO (OIDC/SAML), RBAC teams/groups, and multi-mailbox routing.

## [2.1.0] - 2026-06-27

- Added a production container image and a GHCR publish workflow; linked the
  GHCR package to the repository and fixed the publish token/permissions.
- Rewrote the landing site for the voicemail-regulator pivot.
- Published images under the Spillers Technology GHCR namespace.

## [2.0.0] - 2026-06-27

- Pivoted ComFlow from its original phone-agent prototype to a voicemail
  regulator: receive, transcribe/structure, present for human review, and
  integrate — deliberately not an AI receptionist that fakes a conversation.

## Pre-2.0.0 (2025-06 - 2026-04)

Early prototype work exploring a conversational phone-answering agent
(SIP registration, Whisper transcription, an early wireframe UI, and several
rework/refactor passes) before the 2.0.0 pivot to the current voicemail
regulator concept. Not independently versioned or released.
