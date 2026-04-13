# ComFlow

ComFlow is a smart voicemail inbox for small support teams.

Instead of treating missed calls like loose scraps of audio, ComFlow turns each
inbound voicemail-style interaction into a structured work item: recording,
transcript, summary, intent, urgency, status, notes, and queue assignment, all
in one review flow.

This repo currently implements the first practical slice of that product:

- capture inbound call records through telephony-style webhooks
- store recording references on local disk
- transcribe recordings with a provider interface
- extract structured metadata from transcripts
- review and edit calls in a simple web UI
- add internal notes and move calls through an operational workflow

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
- editable metadata form
- notes section
- fake data mode for local development
- backend-owned business logic for ingestion and review

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
- `GET /api/calls`
- `GET /api/calls/:id`
- `GET /api/calls/:id/recording`
- `PATCH /api/calls/:id`
- `POST /api/calls/:id/notes`
- `POST /api/webhooks/telephony/inbound`
- `POST /api/webhooks/telephony/recording-complete`

Implementation choices are deliberately MVP-friendly:

- TypeScript throughout
- Zod validation at the boundaries
- SQLite via `better-sqlite3`
- local disk recording storage
- fake telephony, STT, and extraction providers for local work
- service and provider interfaces that can be replaced later with real vendors

## Frontend Experience

The frontend is built for a support operator, not a product demo judge.

- the inbox lists recent calls with status, intent, urgency, queue, and summary
- the detail view shows the recording, transcript, editable metadata, and notes
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

Seed local demo data:

```bash
npm run seed
```

Run backend and frontend together:

```bash
npm run dev
```

Typical local URLs:

- frontend: `http://localhost:5173`
- backend: `http://localhost:3001`

Build the packages:

```bash
npm run build
```

## Current Position

ComFlow is now past the "just a UI concept" stage and into "small working MVP"
territory.

It already behaves like the foundation of a real product for missed-call review
and follow-up, while still using fake providers so development can continue
without waiting on telephony or LLM vendor setup.

## Next Small Steps

The most natural next moves are:

- add one real telephony adapter
- replace fake extraction with a real LLM-backed extractor
- expand inbox filtering
- add route and integration tests
- retire the older prototype folders once the new workspace is the only path

## Short Version

ComFlow is a human-reviewed AI voicemail inbox.

It captures missed calls, turns them into structured support work, and gives a
small team a clean place to review, correct, assign, and resolve what came in.
