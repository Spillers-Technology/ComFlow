# ComFlow

ComFlow is a **voicemail regulator**: it receives voicemails over SIP, processes
them (transcribe → extract → summarize), gives a team a golden inbox to review
them, and syncs the ones worth acting on into [AnchorDesk](../anchordesk) as
tickets.

It is deliberately **not** an AI receptionist. For full conversational
call-handling, use [agentvoiceresponse](https://github.com/agentvoiceresponse).
ComFlow stays in its lane: receive, process, present, integrate.

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
- **Local accounts + admin config**: first-class local auth (open by default),
  a configurable single mailbox + DID, and greeting management.

## Repo layout

```text
.
├─ packages/
│  ├─ shared/    # domain models + Zod schemas
│  ├─ backend/   # Express API, SQLite, providers, telephony gateway
│  └─ frontend/  # Vite + React + MUI operator UI
├─ infra/baresip/  # SIP edge: Dockerfile, config, accounts (BYO credentials)
└─ docker-compose.yml
```

## Running it

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

Build + verify:

```bash
npm run build
npm test --workspace @comflow/backend
```

## API surface

Open: `GET /api/health`, `POST /api/auth/login`, `GET /api/auth/me`,
`POST /api/webhooks/telephony/{inbound,recording-complete}`.

Guarded (pass-through in open mode): `/api/calls*`, `/api/scheduled-calls*`,
`/api/prompts*`, `/api/mailboxes*`, `/api/settings/*`.

## Configuration

All env vars are documented in [.env.example](.env.example). Highlights:

- **Engines**: `COMFLOW_{OPENAI,ANTHROPIC,ELEVENLABS}_API_KEY`,
  `COMFLOW_DEFAULT_{LLM,STT,TTS}_*`. The backend loads `.env` automatically
  for local runs; Docker/Kubernetes-provided env still wins. Provider
  selections and admin-entered API-key overrides persist in SQLite.
- **Mailbox**: `COMFLOW_DEFAULT_MAILBOX_{NAME,NUMBER,SIP_ACCOUNT_REF}` seeds
  the first mailbox; later edits from the Connections admin page persist.
- **Telephony**: `COMFLOW_TELEPHONY` (`fake`|`baresip`), `BARESIP_CTRL_*`,
  `COMFLOW_GREETING_PATH`, `COMFLOW_SIP_OUTBOUND_DOMAIN`, outbound timing.
- **AnchorDesk**: `ANCHORDESK_SYNC_ENABLED`, `ANCHORDESK_BASE_URL`,
  `ANCHORDESK_API_TOKEN`.
- **Email notifications**: `COMFLOW_EMAIL_NOTIFICATIONS_ENABLED`,
  `COMFLOW_SMTP_*`, `COMFLOW_NOTIFICATION_EMAIL_{FROM,TO}`. Defaults are
  local-Postfix friendly (`127.0.0.1:25`, no auth/TLS unless configured).
- **Auth**: `COMFLOW_AUTH_REQUIRED` (default `false`), session secret/TTL,
  `COMFLOW_BOOTSTRAP_ADMIN_{EMAIL,PASSWORD}`.

## Roadmap

- **M1 (now)**: baresip SIP ingestion; tight scheduled-outbound; AnchorDesk sync;
  polished single inbox; audio-prompt uploads; local accounts + single
  mailbox/DID admin config.
- **M2 — SSO**: OIDC / SAML 2.0 behind the same `AuthProvider` interface,
  aligned with AnchorDesk's Authentik setup.
- **M3 — Multi-mailbox & teams**: multiple DIDs/lines as multiple mailboxes
  assigned to accounts; admin maps SIP connections → mailboxes → users.

## Short version

ComFlow captures missed calls over SIP, turns them into structured, reviewable
work, and feeds the ones that matter into AnchorDesk — a focused voicemail
regulator, not a receptionist.
