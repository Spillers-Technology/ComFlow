import assert from 'node:assert/strict'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadEnvFile } from './lib/envFile.js'
import { createSilentWav } from './lib/audio.js'

process.env.COMFLOW_SEED_DEMO = 'false'
process.env.PORT = '0'
process.env.COMFLOW_EMAIL_NOTIFICATIONS_ENABLED = 'false'
process.env.COMFLOW_OPENAI_API_KEY = 'env-openai-test-key'
process.env.COMFLOW_ANTHROPIC_API_KEY = ''
process.env.ANTHROPIC_API_KEY = ''
process.env.COMFLOW_ELEVENLABS_API_KEY = ''
process.env.ELEVENLABS_API_KEY = ''
process.env.COMFLOW_DEFAULT_LLM_PROVIDER = 'openai'
process.env.COMFLOW_DEFAULT_LLM_MODEL = 'gpt-4o-mini'
process.env.COMFLOW_DEFAULT_STT_PROVIDER = 'elevenlabs'
process.env.COMFLOW_DEFAULT_STT_MODEL = 'scribe_v2'
process.env.COMFLOW_DEFAULT_TTS_PROVIDER = 'openai'
process.env.COMFLOW_DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts'
process.env.COMFLOW_DEFAULT_TTS_VOICE = 'alloy'
process.env.COMFLOW_DEFAULT_MAILBOX_NAME = 'Cluster mailbox'
process.env.COMFLOW_DEFAULT_MAILBOX_NUMBER = '+15550123'
process.env.COMFLOW_DEFAULT_MAILBOX_SIP_ACCOUNT_REF = 'cluster-sip-main'

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
    DELETE FROM call_notes;
    DELETE FROM calls;
    DELETE FROM engine_settings;
    DELETE FROM engine_secret_overrides;
    DELETE FROM mailboxes;
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
  await runTest('env files are loaded without overriding real env vars', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comflow-env-'))
    const envPath = path.join(tempDir, '.env')
    const unsetName = 'COMFLOW_ENV_FILE_TEST_VALUE'
    const presetName = 'COMFLOW_ENV_FILE_PRESET_VALUE'
    delete process.env[unsetName]
    process.env[presetName] = 'from-process'
    fs.writeFileSync(
      envPath,
      [
        `${unsetName}="from file"`,
        `${presetName}=from-file`,
        'COMFLOW_IGNORES_COMMENTS=value # local note',
      ].join('\n')
    )

    try {
      assert.equal(loadEnvFile(envPath), envPath)
      assert.equal(process.env[unsetName], 'from file')
      assert.equal(process.env[presetName], 'from-process')
      assert.equal(process.env.COMFLOW_IGNORES_COMMENTS, 'value')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
      delete process.env[unsetName]
      delete process.env[presetName]
      delete process.env.COMFLOW_IGNORES_COMMENTS
    }
  })

  await runTest('defaults apply before any persisted settings', async () => {
    await withServer(async baseUrl => {
      const result = await requestJson(baseUrl, '/api/settings/engines')
      const body = result.body as {
        settings: {
          llm: { provider: string; model: string | null }
          stt: { provider: string }
          tts: { voice: string | null }
        }
        secrets: {
          openaiApiKey: { source: string; configured: boolean }
          elevenLabsApiKey: { source: string; configured: boolean }
        }
      }
      assert.equal(result.response.status, 200)
      assert.equal(body.settings.llm.provider, 'openai')
      assert.equal(body.settings.llm.model, 'gpt-4o-mini')
      assert.equal(body.settings.stt.provider, 'elevenlabs')
      assert.equal(body.settings.tts.voice, 'alloy')
      assert.equal(body.secrets.openaiApiKey.source, 'env')
      assert.equal(body.secrets.openaiApiKey.configured, true)
      assert.equal(body.secrets.elevenLabsApiKey.source, 'missing')
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

  await runTest('admin-entered secrets override missing env secrets', async () => {
    await withServer(async baseUrl => {
      const settings = {
        llm: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
        stt: { provider: 'fake', model: null },
        tts: { provider: 'fake', model: null, voice: null },
      }

      const missing = await requestJson(baseUrl, '/api/settings/engines', {
        method: 'PATCH',
        body: JSON.stringify({ settings }),
      })
      const missingBody = missing.body as {
        readiness: { llm: { ready: boolean; missingSecrets: string[] } }
        secrets: { anthropicApiKey: { source: string } }
      }
      assert.equal(missing.response.status, 200)
      assert.equal(missingBody.readiness.llm.ready, false)
      assert.deepEqual(missingBody.readiness.llm.missingSecrets, [
        'COMFLOW_ANTHROPIC_API_KEY',
      ])
      assert.equal(missingBody.secrets.anthropicApiKey.source, 'missing')

      const saved = await requestJson(baseUrl, '/api/settings/engines', {
        method: 'PATCH',
        body: JSON.stringify({
          settings,
          secrets: { anthropicApiKey: 'admin-anthropic-key' },
        }),
      })
      const savedBody = saved.body as {
        readiness: { llm: { ready: boolean; missingSecrets: string[] } }
        secrets: { anthropicApiKey: { source: string; configured: boolean } }
      }
      assert.equal(saved.response.status, 200)
      assert.equal(savedBody.readiness.llm.ready, true)
      assert.deepEqual(savedBody.readiness.llm.missingSecrets, [])
      assert.equal(savedBody.secrets.anthropicApiKey.source, 'stored')
      assert.equal(savedBody.secrets.anthropicApiKey.configured, true)

      const reloaded = await requestJson(baseUrl, '/api/settings/engines')
      const reloadedBody = reloaded.body as {
        readiness: { llm: { ready: boolean } }
        secrets: { anthropicApiKey: { source: string } }
      }
      assert.equal(reloadedBody.readiness.llm.ready, true)
      assert.equal(reloadedBody.secrets.anthropicApiKey.source, 'stored')

      const cleared = await requestJson(baseUrl, '/api/settings/engines', {
        method: 'PATCH',
        body: JSON.stringify({
          settings,
          secrets: { anthropicApiKey: null },
        }),
      })
      const clearedBody = cleared.body as {
        readiness: { llm: { ready: boolean } }
        secrets: { anthropicApiKey: { source: string } }
      }
      assert.equal(clearedBody.readiness.llm.ready, false)
      assert.equal(clearedBody.secrets.anthropicApiKey.source, 'missing')
    })
  })

  await runTest('mailbox env defaults apply on first boot', async () => {
    await withServer(async baseUrl => {
      const result = await requestJson(baseUrl, '/api/mailboxes')
      const body = result.body as {
        items: Array<{
          id: string
          name: string
          number: string | null
          sipAccountRef: string | null
        }>
      }
      const mailbox = body.items[0]

      assert.equal(result.response.status, 200)
      assert.ok(mailbox)
      assert.equal(mailbox.name, 'Cluster mailbox')
      assert.equal(mailbox.number, '+15550123')
      assert.equal(mailbox.sipAccountRef, 'cluster-sip-main')

      const updated = await requestJson(baseUrl, `/api/mailboxes/${mailbox.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Admin mailbox',
          number: '+15550999',
          sipAccountRef: 'admin-sip',
        }),
      })
      const updatedBody = updated.body as {
        mailbox: {
          name: string
          number: string | null
          sipAccountRef: string | null
        }
      }

      assert.equal(updated.response.status, 200)
      assert.equal(updatedBody.mailbox.name, 'Admin mailbox')
      assert.equal(updatedBody.mailbox.number, '+15550999')
      assert.equal(updatedBody.mailbox.sipAccountRef, 'admin-sip')
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

  await runTest('recordings can be downloaded with a stable filename', async () => {
    await withServer(async baseUrl => {
      await requestJson(baseUrl, '/api/settings/engines', {
        method: 'PATCH',
        body: JSON.stringify({
          llm: { provider: 'fake', model: null },
          stt: { provider: 'fake', model: null },
          tts: { provider: 'fake', model: null, voice: null },
        }),
      })

      const inbound = await requestJson(
        baseUrl,
        '/api/webhooks/telephony/inbound',
        {
          method: 'POST',
          body: JSON.stringify({
            telephonyCallId: 'download-call-001',
            source: 'fake',
            fromNumber: '+1 555 700 1000',
          }),
        }
      )
      assert.equal(inbound.response.status, 202)

      const completed = await requestJson(
        baseUrl,
        '/api/webhooks/telephony/recording-complete',
        {
          method: 'POST',
          body: JSON.stringify({
            telephonyCallId: 'download-call-001',
            recordingBase64: createSilentWav().toString('base64'),
            mimeType: 'audio/wav',
            transcript:
              'Hi, this is Riley from Atlas Dental. Please call me back about billing.',
          }),
        }
      )
      const completedBody = completed.body as { callId: string }
      assert.equal(completed.response.status, 202)

      const detail = await requestJson(
        baseUrl,
        `/api/calls/${completedBody.callId}`
      )
      const detailBody = detail.body as {
        recordingDownloadUrl: string | null
      }
      assert.equal(detail.response.status, 200)
      assert.ok(detailBody.recordingDownloadUrl)

      const download = await fetch(
        `${baseUrl}${detailBody.recordingDownloadUrl}`
      )
      assert.equal(download.status, 200)
      assert.match(
        download.headers.get('content-disposition') ?? '',
        /attachment; filename="comflow-voicemail-.*\.wav"/
      )
      assert.match(download.headers.get('content-type') ?? '', /audio\/wav/)
      assert.ok((await download.arrayBuffer()).byteLength > 0)
    })
  })

  const { db } = await getModules()
  db.close()
}

void main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
