import assert from 'node:assert/strict'
import { once } from 'node:events'

process.env.COMFLOW_SEED_DEMO = 'false'
process.env.PORT = '0'
process.env.COMFLOW_DEFAULT_LLM_PROVIDER = 'openai'
process.env.COMFLOW_DEFAULT_LLM_MODEL = 'gpt-4o-mini'
process.env.COMFLOW_DEFAULT_STT_PROVIDER = 'elevenlabs'
process.env.COMFLOW_DEFAULT_STT_MODEL = 'scribe_v2'
process.env.COMFLOW_DEFAULT_TTS_PROVIDER = 'openai'
process.env.COMFLOW_DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts'
process.env.COMFLOW_DEFAULT_TTS_VOICE = 'alloy'

async function getModules() {
  const [{ createApp }, { db }] = await Promise.all([
    import('./app.js'),
    import('./db/client.js'),
  ])

  return { createApp, db }
}

async function resetDb() {
  const { db } = await getModules()
  db.exec(`
    DELETE FROM callback_attempts;
    DELETE FROM call_notes;
    DELETE FROM calls;
    DELETE FROM engine_settings;
  `)
}

async function withServer<T>(run: (baseUrl: string) => Promise<T>) {
  const { createApp } = await getModules()
  const app = createApp()
  const server = app.listen(0)
  await once(server, 'listening')
  const address = server.address()
  const port =
    typeof address === 'object' && address ? address.port : undefined

  if (!port) {
    throw new Error('Could not determine test server port.')
  }

  try {
    return await run(`http://127.0.0.1:${port}`)
  } finally {
    server.close()
    await once(server, 'close')
  }
}

async function requestJson(
  baseUrl: string,
  pathname: string,
  init: RequestInit = {}
): Promise<{ response: Response; body: Record<string, unknown> | null }> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  })
  const text = await response.text()
  return {
    response,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
  }
}

async function runTest(name: string, fn: () => Promise<void>) {
  await resetDb()

  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

async function main() {
  await runTest('defaults apply before any persisted settings', async () => {
    await withServer(async baseUrl => {
      const result = await requestJson(baseUrl, '/api/settings/engines')
      const body = result.body as {
        settings: {
          llm: { provider: string; model: string | null }
          stt: { provider: string }
          tts: { voice: string | null }
        }
      }
      assert.equal(result.response.status, 200)
      assert.equal(body.settings.llm.provider, 'openai')
      assert.equal(body.settings.llm.model, 'gpt-4o-mini')
      assert.equal(body.settings.stt.provider, 'elevenlabs')
      assert.equal(body.settings.tts.voice, 'alloy')
    })
  })

  await runTest('persisted settings override defaults and survive reloads', async () => {
    await withServer(async baseUrl => {
      const updated = await requestJson(baseUrl, '/api/settings/engines', {
        method: 'PATCH',
        body: JSON.stringify({
          llm: { provider: 'fake', model: null },
          stt: { provider: 'fake', model: null },
          tts: { provider: 'fake', model: null, voice: null },
        }),
      })
      const updatedBody = updated.body as {
        settings: { llm: { provider: string } }
      }

      assert.equal(updated.response.status, 200)
      assert.equal(updatedBody.settings.llm.provider, 'fake')

      const reloaded = await requestJson(baseUrl, '/api/settings/engines')
      const reloadedBody = reloaded.body as {
        settings: {
          llm: { provider: string }
          stt: { provider: string }
          tts: { provider: string }
        }
      }
      assert.equal(reloaded.response.status, 200)
      assert.equal(reloadedBody.settings.llm.provider, 'fake')
      assert.equal(reloadedBody.settings.stt.provider, 'fake')
      assert.equal(reloadedBody.settings.tts.provider, 'fake')
    })
  })

  await runTest('invalid real-provider payloads are rejected', async () => {
    await withServer(async baseUrl => {
      const result = await requestJson(baseUrl, '/api/settings/engines', {
        method: 'PATCH',
        body: JSON.stringify({
          llm: { provider: 'openai', model: null },
          stt: { provider: 'fake', model: null },
          tts: { provider: 'fake', model: null, voice: null },
        }),
      })

      assert.equal(result.response.status, 400)
      assert.match(
        String((result.body as { error?: string } | null)?.error),
        /Model is required/
      )
    })
  })

  await runTest('recording ingestion uses fake engines when selected', async () => {
    await withServer(async baseUrl => {
      await requestJson(baseUrl, '/api/settings/engines', {
        method: 'PATCH',
        body: JSON.stringify({
          llm: { provider: 'fake', model: null },
          stt: { provider: 'fake', model: null },
          tts: { provider: 'fake', model: null, voice: null },
        }),
      })

      const accepted = await requestJson(baseUrl, '/api/webhooks/telephony/inbound', {
        method: 'POST',
        body: JSON.stringify({
          telephonyCallId: 'test-call-001',
          source: 'fake',
          fromNumber: '+1 555 100 2000',
          transcript:
            'Hi, this is Sarah Lee from Acme Health. We need urgent support with a portal outage. Please call me back at +1 555 100 2000.',
        }),
      })

      assert.equal(accepted.response.status, 202)

      const calls = await requestJson(baseUrl, '/api/calls')
      const callsBody = calls.body as {
        items: Array<{ intent: string; urgency: string }>
      }
      assert.equal(calls.response.status, 200)
      assert.equal(callsBody.items.length, 1)
      assert.equal(callsBody.items[0]?.intent, 'support_request')
      assert.equal(callsBody.items[0]?.urgency, 'high')
    })
  })

  await runTest('callback flow stores an attempt and playable audio', async () => {
    await withServer(async baseUrl => {
      await requestJson(baseUrl, '/api/settings/engines', {
        method: 'PATCH',
        body: JSON.stringify({
          llm: { provider: 'fake', model: null },
          stt: { provider: 'fake', model: null },
          tts: { provider: 'fake', model: null, voice: null },
        }),
      })

      const accepted = await requestJson(baseUrl, '/api/webhooks/telephony/inbound', {
        method: 'POST',
        body: JSON.stringify({
          telephonyCallId: 'test-call-002',
          source: 'fake',
          fromNumber: '+1 555 300 4000',
          transcript:
            'Hello, Marco Ruiz from Northfield Labs here. I have a billing question about our invoice and can be reached at +1 555 300 4000.',
        }),
      })
      const acceptedBody = accepted.body as { callId: string }

      const callId = acceptedBody.callId
      const callback = await requestJson(baseUrl, `/api/calls/${callId}/callbacks`, {
        method: 'POST',
        body: JSON.stringify({
          notes: 'Confirm the invoice number before discussing payment status.',
        }),
      })
      const callbackBody = callback.body as {
        attempt: {
          status: string
          providerSnapshot: { telephonyProvider: string }
          audioUrl: string | null
        }
      }

      assert.equal(callback.response.status, 201)
      assert.equal(callbackBody.attempt.status, 'simulated_completed')
      assert.equal(callbackBody.attempt.providerSnapshot.telephonyProvider, 'fake')
      assert.ok(callbackBody.attempt.audioUrl)

      const detail = await requestJson(baseUrl, `/api/calls/${callId}`)
      const detailBody = detail.body as {
        callbackAttempts: Array<unknown>
      }
      assert.equal(detail.response.status, 200)
      assert.equal(detailBody.callbackAttempts.length, 1)

      const audioResponse = await fetch(`${baseUrl}${callbackBody.attempt.audioUrl}`)
      assert.equal(audioResponse.status, 200)
      assert.match(audioResponse.headers.get('content-type') ?? '', /^audio\//)
    })
  })

  const { db } = await getModules()
  db.close()
}

void main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
