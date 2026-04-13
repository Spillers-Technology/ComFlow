# ComFlow

ComFlow is a smart voicemail inbox for small support teams.

Instead of treating missed calls like loose scraps of audio, ComFlow turns each
inbound voicemail-style interaction into a structured work item: recording,
transcript, summary, intent, urgency, status, notes, and queue assignment, all
in one review flow.

This repo currently implements the first practical slice of that product:

- capture inbound call records through telephony-style webhooks
- store recording references on local disk
- transcribe recordings with a selectable STT provider
- extract structured metadata with a selectable LLM provider
- review and edit calls in a simple web UI
- add internal notes and move calls through an operational workflow
- prepare simulated callback attempts with selectable TTS + LLM engines

## Product Shape

V1 is intentionally narrow.

ComFlow is not trying to be a full AI receptionist yet. It is trying to be a
better voicemail replacement for teams that need to:

- see every missed call in one place
- understand what the caller wanted without replaying everything first
- confirm or correct AI-extracted details
- assign the call to the right queue
- leave internal notes so the next human has context

The product posture is operational, not theatrical: inbox first, review first,
human-in-the-loop by default.

## What Exists Today

The current implementation is a small TypeScript monorepo with three packages:

- `packages/shared`: shared domain models and Zod schemas
- `packages/backend`: Express API, SQLite storage, fake providers, seed data
- `packages/frontend`: Vite + React + MUI operator UI

Today’s MVP already includes:

- call inbox page
- call detail page
- transcript display
- recording player
- callback preparation panel with generated script + synthesized audio
- settings page for engine provider/model/voice selection
- editable metadata form
- notes section
- persisted engine settings in SQLite
- env-backed secret readiness reporting
- fake data mode for local development
- backend-owned business logic for ingestion, review, and callback prep

Supported extracted fields:

- `callerName`
- `company`
- `callbackNumber`
- `intent`
- `urgency`
- `summary`
- `transcript`
- `status`
- `assignedQueue`

## Backend Capabilities

The API currently exposes:

- `GET /api/health`
- `GET /api/settings/engines`
- `PATCH /api/settings/engines`
- `POST /api/settings/engines/test/:engine`
- `GET /api/calls`
- `GET /api/calls/:id`
- `GET /api/calls/:id/recording`
- `POST /api/calls/:id/callbacks`
- `GET /api/callbacks/:id/audio`
- `PATCH /api/calls/:id`
- `POST /api/calls/:id/notes`
- `POST /api/webhooks/telephony/inbound`
- `POST /api/webhooks/telephony/recording-complete`

Implementation choices are deliberately MVP-friendly:

- TypeScript throughout
- Zod validation at the boundaries
- SQLite via `better-sqlite3`
- local disk recording storage
- fake telephony for local callback simulation
- selectable `fake`, OpenAI, Anthropic, and ElevenLabs provider adapters
- service and provider interfaces that can be replaced later with real vendors

Current engine support:

- LLM: `fake`, `openai`, `anthropic`
- STT: `fake`, `openai`, `elevenlabs`
- TTS: `fake`, `openai`, `elevenlabs`

## Frontend Experience

The frontend is built for a support operator, not a product demo judge.

- the inbox lists recent calls with status, intent, urgency, queue, and summary
- the detail view shows the recording, transcript, callback prep, editable metadata, and notes
- the settings page shows active engines, readiness, missing env secrets, and test actions
- operators can review and update extracted information instead of being forced
  to trust automation blindly

The UI is intentionally plainspoken and practical. It is meant to help someone
triage a call quickly, not admire a dashboard.

## Repo Layout

```text
.
├─ packages/
│  ├─ shared/
│  ├─ backend/
│  └─ frontend/
├─ package.json
└─ tsconfig.base.json
```

Main paths:

- `packages/shared/src`: shared types and schemas
- `packages/backend/src`: routes, services, providers, repositories, seed data
- `packages/frontend/src`: app shell, pages, components, API client

There are also older top-level `frontend/` and `backend/` directories from the
earlier prototype phase. The active MVP implementation is under `packages/`.

## Running It

Install dependencies:

```bash
npm install
```

Create a local env file:

```bash
cp .env.example .env
```

Seed local demo data:

```bash
npm run seed
```

Run backend and frontend together:

```bash
npm run dev
```

Or run the dev stack in Docker:

```bash
docker compose up --build
```

Typical local URLs:

- frontend: `http://localhost:5173`
- backend: `http://localhost:3001`

Build the packages:

```bash
npm run build
```

Run backend verification:

```bash
npm test --workspace @comflow/backend
```

## Engine Settings

Provider choice is persisted in SQLite. Secrets are not.

- save provider/model/voice selections in the app
- keep API keys in `.env`
- the backend reads the current persisted settings at runtime for every
  transcription, extraction, and callback generation operation
- `GET /api/health` and the settings page surface readiness plus missing secrets

Relevant env vars:

- `COMFLOW_OPENAI_API_KEY` or `OPENAI_API_KEY`
- `COMFLOW_ANTHROPIC_API_KEY` or `ANTHROPIC_API_KEY`
- `COMFLOW_ELEVENLABS_API_KEY` or `ELEVENLABS_API_KEY`
- `COMFLOW_DEFAULT_LLM_PROVIDER`
- `COMFLOW_DEFAULT_LLM_MODEL`
- `COMFLOW_DEFAULT_STT_PROVIDER`
- `COMFLOW_DEFAULT_STT_MODEL`
- `COMFLOW_DEFAULT_TTS_PROVIDER`
- `COMFLOW_DEFAULT_TTS_MODEL`
- `COMFLOW_DEFAULT_TTS_VOICE`

If no settings have been saved yet, ComFlow falls back to those default env
selectors. If those are also unset, it falls back to `fake` engines.

## Callback Simulation

The callback flow is intentionally small and local-first:

- open a call detail page
- choose `Prepare callback`
- ComFlow generates a callback script from the selected LLM
- ComFlow synthesizes audio with the selected TTS provider
- the fake telephony adapter records a simulated callback attempt

This gives the product a real runtime place to exercise LLM + TTS selection
without adding a carrier integration yet.

## Current Position

ComFlow is now past the "just a UI concept" stage and into "small working MVP"
territory.

It already behaves like the foundation of a real product for missed-call review
and follow-up, while still letting teams mix fake and real AI providers during
local development.

## Next Small Steps

The most natural next moves are:

- add one real telephony adapter
- expand inbox filtering
- add per-tenant engine settings
- add real callback delivery after a telephony adapter lands
- retire the older prototype folders once the new workspace is the only path

## Short Version

ComFlow is a human-reviewed AI voicemail inbox.

It captures missed calls, turns them into structured support work, and gives a
small team a clean place to review, correct, assign, and resolve what came in.
