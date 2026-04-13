import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { db } from '../db/client.js'
import { createSilentWav } from '../lib/audio.js'

type SeedCall = {
  callerName: string
  company: string | null
  callbackNumber: string
  intent: string
  urgency: string
  summary: string
  transcript: string
  status: string
  assignedQueue: string | null
  telephonyCallId: string
  recording: boolean
}

const seedCalls: SeedCall[] = [
  {
    callerName: 'Sarah Lee',
    company: 'Acme Health',
    callbackNumber: '+1 555 012 3000',
    intent: 'support_request',
    urgency: 'high',
    summary:
      'Caller needs urgent help resetting access for a customer-facing outage.',
    transcript:
      'Hi, this is Sarah Lee from Acme Health. We need urgent support with a portal outage. Please call me back at +1 555 012 3000 as soon as possible.',
    status: 'new',
    assignedQueue: 'support',
    telephonyCallId: 'fake-call-001',
    recording: true,
  },
  {
    callerName: 'Marco Ruiz',
    company: 'Northfield Labs',
    callbackNumber: '+1 555 889 1122',
    intent: 'billing_request',
    urgency: 'normal',
    summary: 'Caller has a billing question about the latest invoice.',
    transcript:
      'Hello, Marco Ruiz from Northfield Labs here. I have a billing question about our invoice and can be reached at +1 555 889 1122.',
    status: 'reviewed',
    assignedQueue: 'billing',
    telephonyCallId: 'fake-call-002',
    recording: false,
  },
]

export function seedFakeData() {
  const count = db.prepare('SELECT COUNT(*) as count FROM calls').get() as {
    count: number
  }
  if (count.count > 0) return

  const insertCall = db.prepare(`
    INSERT INTO calls (
      id, telephony_call_id, source, caller_name, company, callback_number,
      intent, urgency, summary, transcript, raw_transcript, status,
      assigned_queue, recording_status, recording_path, recording_mime_type,
      reviewed_at, created_at, updated_at
    )
    VALUES (
      @id, @telephony_call_id, @source, @caller_name, @company, @callback_number,
      @intent, @urgency, @summary, @transcript, @raw_transcript, @status,
      @assigned_queue, @recording_status, @recording_path, @recording_mime_type,
      @reviewed_at, @created_at, @updated_at
    )
  `)

  const insertNote = db.prepare(`
    INSERT INTO call_notes (id, call_id, body, author_name, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)

  for (const [index, seed] of seedCalls.entries()) {
    const id = randomUUID()
    const createdAt = new Date(Date.now() - index * 60 * 60 * 1000).toISOString()
    let recordingPath: string | null = null
    let recordingMimeType: string | null = null
    let recordingStatus = 'missing'

    if (seed.recording) {
      recordingPath = path.join('recordings', `${id}.wav`)
      recordingMimeType = 'audio/wav'
      recordingStatus = 'ready'
      fs.writeFileSync(path.join(config.dataDir, recordingPath), createSilentWav())
      fs.writeFileSync(
        path.join(config.dataDir, `${recordingPath}.txt`),
        seed.transcript,
        'utf8'
      )
    }

    insertCall.run({
      id,
      telephony_call_id: seed.telephonyCallId,
      source: 'fake',
      caller_name: seed.callerName,
      company: seed.company,
      callback_number: seed.callbackNumber,
      intent: seed.intent,
      urgency: seed.urgency,
      summary: seed.summary,
      transcript: seed.transcript,
      raw_transcript: JSON.stringify({ provider: 'seed' }),
      status: seed.status,
      assigned_queue: seed.assignedQueue,
      recording_status: recordingStatus,
      recording_path: recordingPath,
      recording_mime_type: recordingMimeType,
      reviewed_at: seed.status === 'new' ? null : createdAt,
      created_at: createdAt,
      updated_at: createdAt,
    })

    insertNote.run(
      randomUUID(),
      id,
      index === 0
        ? 'Escalate to Tier 2 if the callback confirms the outage is still active.'
        : 'Verify invoice number before replying.',
      'ComFlow Demo',
      createdAt
    )
  }
}
