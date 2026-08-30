# ComFlow vs. company standards (STD-001 .. STD-008)

Tracks this repo's status against the standards defined in `corporate-strategy/standards/`.
Statuses: `adopted`, `deviates (reason)`, `not-yet`. Re-derive this from the live repo rather
than trusting it silently — the standards themselves warn that documents like this one are
exactly where staleness hides (STD-003).

Last reconciled: 2026-08-29, against ComFlow `main` plus the LICENSE/CHANGELOG
work applied on this same branch (see STD-003 and STD-007 below).

## STD-001 — Orchestrator-driven, adversarially-reviewed development

**not-yet.** STD-001's own scope line lists ComFlow as "not yet proposed." No `docs/dev-process.md`
or equivalent exists in this repo, and no per-round review log is kept. Not a considered deviation,
just not adopted yet.

## STD-002 — Pull request template

**adopted.** `.github/PULL_REQUEST_TEMPLATE.md` has `## What changed`, `## How it was checked`,
and `## Evidence`, plus a synthetic-data checklist clause ("Only synthetic caller data is
included"). STD-002 lists ComFlow among the repos that already carry this independently.

## STD-003 — Documentation freshness

**not-yet**, narrowed further this branch. Three separate gaps were originally bundled
together in this finding; two are now closed:

- **Fixed in an earlier advance:** the landing page (`docs/index.html`, `#roadmap` section) marked
  "Verified self-serve signup" and "Guided call forwarding" as `Building` even though both
  shipped in commit `1252b08` ("Add self-service signup, QR call-forwarding, and hosted fraud
  controls"), the commit immediately before `672233b` ("Release ComFlow 4.0.0"). Verified against
  live code, not just the page's own text: `packages/frontend/src/pages/RegisterPage.tsx`,
  `packages/backend/src/services/registrationService.ts`, `packages/frontend/src/components/ForwardingSetupCard.tsx`
  (renders a QR via `qrcode.react`), and `packages/shared/src/forwarding.ts` all exist and are
  wired in. Both roadmap items are now marked `Done`.
- **Fixed this branch (D-0031/DR-0001 execution):** the licensing side. `LICENSE` (MIT,
  Spillers Technology, 2026) now exists at the repo root; the "open source" language in the
  README, `docs/index.html` ticker (~line 1084/1094) and install callout (~line 1498/1503), and
  `CONTRIBUTING.md` now names MIT explicitly instead of leaving the claim unbacked. `CHANGELOG.md`
  was also added, reconstructed from `git log` across all six tags (v2.0.0-v4.0.0) plus
  unreleased `main` work — closing that half of the doc-freshness gap too.
- **Still open:** no `docs/releases/` per-version notes exist (CHANGELOG.md is the single
  source for now, which is an acceptable practice per STD-007 — see netviz's precedent — but
  hasn't been explicitly adopted as ComFlow's stated convention).

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

- **Licensing — adopted.** The board decided MIT for ComFlow (`DR-0001`,
  `corporate-strategy/board/meetings/2026-08-24-comflow-license/`, closing D-0003). Execution
  landed on this branch: `LICENSE` at the repo root (MIT, copyright Spillers Technology, 2026,
  consistent with the "Spillers Technology" convention used by most of the portfolio per
  `STD-007`'s own known-deviations table), `license: "MIT"` added to the root and all four
  workspace `package.json` files, and README/landing-page/CONTRIBUTING "open source" language
  now names MIT explicitly. Provenance was checked first per DR-0001 condition 1: git history
  has a single author throughout (`Joseph`/`Joey Spillers`, one email, no external contributors),
  and a full dependency-tree license scan (`license-checker` across ~445 packages) found no
  GPL/AGPL/LGPL or other copyleft licenses — MIT/ISC/Apache-2.0/BSD-2/BSD-3 and a handful of
  other permissive licenses only. `infra/baresip/` is not vendored source: its `Dockerfile`
  clones `baresip`/`libre` from their own upstream repos at container-build time (BSD-3-Clause,
  attributed in the Dockerfile and `infra/baresip/README.md`); nothing from it is checked into
  this repo, so there is no license conflict to manage beyond attribution, which was already
  present.
- **Changelog/release-notes — adopted.** `CHANGELOG.md` added at the repo root, reconstructed
  from `git log --all` and the six `v2.0.0`-`v4.0.0` tags plus unreleased `main` work. No
  `docs/releases/` per-version files (see the STD-003 entry above) — CHANGELOG.md is the sole
  source for now.
- **AI attribution — not-yet / no stated position.** No `CLAUDE.md` or `CONTRIBUTING.md` rule
  governs `Co-Authored-By` trailers in this repo (checked `CONTRIBUTING.md` directly; it says
  nothing about AI attribution). Company-wide, only PartnerCenterBridge has a stated rule ("no AI
  attribution"), and even it broke that rule once. Absent a repo-local or company-wide decision,
  this branch's commits follow ComFlow's existing convention (prior commits already carry
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` / `Claude Sonnet 5 <noreply@anthropic.com>`).

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
| STD-003 | not-yet (doc-freshness "Building" defect and the LICENSE/CHANGELOG entanglement both fixed; per-version `docs/releases/` notes remain open) |
| STD-004 | adopted |
| STD-005 | adopted (partial) |
| STD-006 | not-yet (a) / not-yet (b, unverified) |
| STD-007 | adopted (licensing, DR-0001) / adopted (changelog) / not-yet (AI attribution, no company decision yet) |
| STD-008 | not-yet |
