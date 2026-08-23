# ComFlow vs. company standards (STD-001 .. STD-008)

Tracks this repo's status against the standards defined in `corporate-strategy/standards/`.
Statuses: `adopted`, `deviates (reason)`, `not-yet`. Re-derive this from the live repo rather
than trusting it silently — the standards themselves warn that documents like this one are
exactly where staleness hides (STD-003).

Last reconciled: 2026-08-25, against ComFlow `main` at commit `7eef7a8` plus
the fix applied in this same advance (see below).

## STD-001 — Orchestrator-driven, adversarially-reviewed development

**not-yet.** STD-001's own scope line lists ComFlow as "not yet proposed." No `docs/dev-process.md`
or equivalent exists in this repo, and no per-round review log is kept. Not a considered deviation,
just not adopted yet.

## STD-002 — Pull request template

**adopted.** `.github/PULL_REQUEST_TEMPLATE.md` has `## What changed`, `## How it was checked`,
and `## Evidence`, plus a synthetic-data checklist clause ("Only synthetic caller data is
included"). STD-002 lists ComFlow among the repos that already carry this independently.

## STD-003 — Documentation freshness

**not-yet**, narrowed. Two separate gaps were bundled together in the original finding; only
one is closed here:

- **Fixed this advance:** the landing page (`docs/index.html`, `#roadmap` section) marked
  "Verified self-serve signup" and "Guided call forwarding" as `Building` even though both
  shipped in commit `1252b08` ("Add self-service signup, QR call-forwarding, and hosted fraud
  controls"), the commit immediately before `672233b` ("Release ComFlow 4.0.0"). Verified against
  live code, not just the page's own text: `packages/frontend/src/pages/RegisterPage.tsx`,
  `packages/backend/src/services/registrationService.ts`, `packages/frontend/src/components/ForwardingSetupCard.tsx`
  (renders a QR via `qrcode.react`), and `packages/shared/src/forwarding.ts` all exist and are
  wired in. Both roadmap items are now marked `Done`.
- **Still open, out of scope for this advance:** no `CHANGELOG.md` and no `docs/releases/` exist
  at all, so there is nothing yet to check version-consistency against release notes. Standing
  up either is real scope (retroactively reconstructing history for three releases: 2.x, 3.0.0,
  4.0.0), not a one-line fix, and is left for a future advance.
- **Still open, explicitly not this advance's to touch:** the doc-freshness question is also
  entangled with D-0003 (ComFlow has no LICENSE file despite calling itself "open source" in the
  README and landing-page footer/ticker). That entanglement is at the repo level (both are
  "things the docs claim that need reconciling"), not a text-level entanglement — the "Building"
  badges live in the `#roadmap` section (`docs/index.html` ~line 1332-1489) and the "open
  source" language lives in the ticker (~line 1084) and the install callout (~line 1503),
  structurally separate blocks. They were separable in practice; only the licensing side stays
  untouched here, per D-0003.

## STD-004 — Identity architecture

**adopted** (reference implementation). STD-004 names ComFlow as one of the three reference
products for the three-plane shape: local auth open by default, optional OIDC/SAML SSO, and a
`cf_…` prefixed bearer-token plane shared by the REST API and the MCP server.

## STD-005 — Agent-facing surface (MCP + token plane + human-in-the-loop gating)

**adopted (partial)**, per STD-005 itself: ComFlow ships an MCP server and shares its `cf_…`
bearer-key plane identically between the REST API and MCP — "the simplest of the three [products
with an MCP surface], appropriate to its smaller surface." No `PendingAction`-style
human-approval queue for consequential/destructive MCP actions exists yet (PartnerCenterBridge
is the only product with that). STD-005 itself is still advisory company-wide, so this is
recorded as informational, not a gap to close unilaterally.

## STD-006 — Secret handling

- **(a) Deployment secrets at rest in git — not-yet.** No `.sops.yaml` or encrypted deploy
  secrets file exists in this repo; ComFlow doesn't currently commit deployment secrets to git
  at all (`.env.example` only, real values via environment injection per `SECURITY.md`), so
  there's nothing to encrypt yet, but there's also no SOPS setup to point to if that changes.
- **(b) Application-runtime write-only secrets — not formally verified.** `SECURITY.md` documents
  the intent (secrets via env/Kubernetes Secrets, never in ConfigMaps or deployment literals;
  local `.env`/SIP/SQLite/key files are gitignored), but no code-level audit confirming secrets
  are never round-tripped back to a caller or logged has been done as part of this advance.
  Left `not-yet` rather than `adopted` until that's actually checked.

## STD-007 — Repo metadata (licensing, changelog, AI attribution)

- **Licensing — not-yet, explicitly out of scope.** No LICENSE file exists; README and landing
  page call ComFlow "open source." This is D-0003, an open operator decision, not touched by
  this advance or this document.
- **Changelog/release-notes — not-yet.** Confirmed: no `CHANGELOG.md`, no `docs/releases/`.
  Same gap as the STD-003 entry above.
- **AI attribution — not-yet / no stated position.** No `CLAUDE.md` or `CONTRIBUTING.md` rule
  governs `Co-Authored-By` trailers in this repo (checked `CONTRIBUTING.md` directly; it says
  nothing about AI attribution). Company-wide, only PartnerCenterBridge has a stated rule ("no AI
  attribution"), and even it broke that rule once. Absent a repo-local or company-wide decision,
  this advance's commit uses a plain `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
  trailer, consistent with ComFlow's existing history (4 prior commits already carry
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).

## STD-008 — UI capture & overflow validation

**not-yet.** ComFlow has a real capture script (`docs/scripts/capture-product-media.mjs`) that
produces the landing-page screenshots, confirmed at a single 1440×960 desktop viewport with no
mobile/responsive matrix and no overflow or console-error assertion. Not wired into CI —
`nodejs-ci.yml` runs `npm run build` and backend tests only. Matches STD-008's own table for
ComFlow exactly; no drift found between that table and this repo's actual state.

## Summary

| Standard | Status |
|---|---|
| STD-001 | not-yet |
| STD-002 | adopted |
| STD-003 | not-yet (doc-freshness "Building" defect fixed this advance; CHANGELOG/`docs/releases/` gap and the LICENSE-entangled portion remain open) |
| STD-004 | adopted |
| STD-005 | adopted (partial) |
| STD-006 | not-yet (a) / not-yet (b, unverified) |
| STD-007 | not-yet (licensing — out of scope, D-0003) / not-yet (changelog) / not-yet (AI attribution, no company decision yet) |
| STD-008 | not-yet |
