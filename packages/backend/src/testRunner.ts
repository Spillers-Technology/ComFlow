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
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comflow-test-data-'))
process.env.COMFLOW_DATA_DIR = testDataDir
process.env.BARESIP_ACCOUNTS_PATH = path.join(
  testDataDir,
  'baresip',
  'accounts'
)
process.env.COMFLOW_SIP_AUTH_PASSWORD = ''
// Exercises the SSO admin allowlist (promote-on-login) in the provisioning test.
process.env.AUTH_ADMIN_EMAILS = 'boss@example.com'

async function getModules() {
  const [{ createApp }, { db, ensurePrimaryTenant }] = await Promise.all([
    import('./app.js'),
    import('./db/client.js'),
  ])

  return { createApp, db, ensurePrimaryTenant }
}

async function resetDb() {
  const { db } = await getModules()
  // Child tables first so deletes don't trip foreign-key constraints.
  db.exec(`
    DELETE FROM call_notes;
    DELETE FROM calls;
    DELETE FROM engine_settings;
    DELETE FROM engine_secret_overrides;
    DELETE FROM sip_settings;
    DELETE FROM scheduled_calls;
    DELETE FROM audio_prompts;
    DELETE FROM group_members;
    DELETE FROM group_mailboxes;
    DELETE FROM sso_group_mappings;
    DELETE FROM sso_login_states;
    DELETE FROM groups;
    DELETE FROM did_provisioning_reservations;
    DELETE FROM provisioned_dids;
    DELETE FROM usage_events;
    DELETE FROM billing_alert_outbox;
    DELETE FROM billing_events;
    DELETE FROM tenant_billing;
    DELETE FROM audit_log;
    DELETE FROM tenant_limits;
    DELETE FROM users;
    DELETE FROM mailboxes;
    DELETE FROM tenants;
  `)
  fs.rmSync(process.env.BARESIP_ACCOUNTS_PATH!, { force: true })
}

async function withServer<T>(run: (baseUrl: string) => Promise<T>) {
  const { createApp } = await getModules()
  const app = createApp()
  // Tests never need LAN exposure. Binding loopback explicitly also prevents a
  // permissive host firewall from publishing the ephemeral integration server.
  const server = app.listen(0, '127.0.0.1')
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
  // Spread init first: otherwise its `headers` replaces the merged object and
  // callers passing an Authorization header lose Content-Type, leaving the
  // body unparsed by express.json().
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
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

  await runTest('baresip account rendering uses the expected format', async () => {
    const { renderBaresipAccountLine } = await import(
      './services/baresipManagementService.js'
    )

    const line = renderBaresipAccountLine(
      {
        enabled: true,
        accountLabel: 'main',
        accountUri: 'sip:1001@pbx.example.com',
        authUsername: 'auth-1001',
        outboundProxy: 'sip:sbc.example.com',
        outboundDialingDomain: 'pbx.example.com',
        registrationInterval: 600,
        preferredCodecs: ['PCMU/8000/1', 'PCMA/8000/1'],
      },
      'sip-secret'
    )

    assert.equal(
      line,
      '"main" <sip:1001@pbx.example.com>;auth_user="auth-1001";auth_pass="sip-secret";outbound="sip:sbc.example.com";answermode=auto;regint=600;audio_codecs=PCMU/8000/1,PCMA/8000/1'
    )
  })

  await runTest('SIP settings write accounts file without API password leak', async () => {
    await withServer(async baseUrl => {
      const settings = {
        enabled: true,
        accountLabel: 'main',
        accountUri: 'sip:1001@pbx.example.com',
        authUsername: 'auth-1001',
        outboundProxy: 'sip:sbc.example.com',
        outboundDialingDomain: 'pbx.example.com',
        registrationInterval: 600,
        preferredCodecs: ['PCMU/8000/1', 'PCMA/8000/1'],
      }

      const saved = await requestJson(baseUrl, '/api/settings/sip', {
        method: 'PUT',
        body: JSON.stringify({
          settings,
          secrets: { authPassword: 'admin-sip-password' },
        }),
      })
      const savedText = JSON.stringify(saved.body)
      const savedBody = saved.body as {
        settings: { accountUri: string }
        secrets: { authPassword: { source: string; configured: boolean } }
        status: { accountsPath: string }
      }

      assert.equal(saved.response.status, 200)
      assert.equal(savedBody.settings.accountUri, 'sip:1001@pbx.example.com')
      assert.equal(savedBody.secrets.authPassword.source, 'stored')
      assert.equal(savedBody.secrets.authPassword.configured, true)
      assert.equal(savedText.includes('admin-sip-password'), false)
      assert.equal(
        savedBody.status.accountsPath,
        process.env.BARESIP_ACCOUNTS_PATH
      )

      const accounts = fs.readFileSync(
        process.env.BARESIP_ACCOUNTS_PATH!,
        'utf8'
      )
      assert.match(accounts, /<sip:1001@pbx\.example\.com>/)
      assert.match(accounts, /auth_pass="admin-sip-password"/)
      assert.match(accounts, /audio_codecs=PCMU\/8000\/1,PCMA\/8000\/1/)

      const reloaded = await requestJson(baseUrl, '/api/settings/sip')
      assert.equal(JSON.stringify(reloaded.body).includes('admin-sip-password'), false)
    })
  })

  await runTest('invalid SIP settings are rejected', async () => {
    await withServer(async baseUrl => {
      const result = await requestJson(baseUrl, '/api/settings/sip', {
        method: 'PUT',
        body: JSON.stringify({
          settings: {
            enabled: true,
            accountLabel: 'main',
            accountUri: 'not-a-sip-uri',
            authUsername: null,
            outboundProxy: null,
            outboundDialingDomain: null,
            registrationInterval: 600,
            preferredCodecs: [],
          },
          secrets: { authPassword: 'admin-sip-password' },
        }),
      })

      assert.equal(result.response.status, 400)
      assert.match(
        String((result.body as { error?: string } | null)?.error),
        /SIP account URI/
      )
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

  await runTest('rbac scopes mailbox access and call lists', async () => {
    const { db, ensurePrimaryTenant } = await getModules()
    const { userRepository } = await import('./repositories/userRepository.js')
    const { groupRepository } = await import('./repositories/groupRepository.js')
    const { callRepository } = await import('./repositories/callRepository.js')
    const { accessService, ALL_MAILBOXES } = await import(
      './services/accessService.js'
    )
    const { CallReviewService } = await import('./services/callReviewService.js')

    const tenantId = ensurePrimaryTenant({ name: 'Primary', slug: 'primary' })
    const now = new Date().toISOString()
    const insertMailbox = db.prepare(`
      INSERT INTO mailboxes (id, name, number, greeting_prompt_id, sip_account_ref, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insertMailbox.run('mb-a', 'Mailbox A', null, null, null, tenantId, now, now)
    insertMailbox.run('mb-b', 'Mailbox B', null, null, null, tenantId, now, now)

    const admin = userRepository.create({
      email: 'admin@example.com',
      displayName: 'Admin',
      passwordHash: null,
      role: 'admin',
      tenantId,
    })
    const member = userRepository.create({
      email: 'member@example.com',
      displayName: 'Member',
      passwordHash: null,
      role: 'member',
      tenantId,
    })

    const group = groupRepository.create({ name: 'Team A', tenantId })
    groupRepository.setMailboxes(group.id, ['mb-a'])
    groupRepository.setMembers(group.id, [member.id])

    assert.equal(accessService.accessibleMailboxIds(admin), ALL_MAILBOXES)
    assert.deepEqual(accessService.accessibleMailboxIds(member), ['mb-a'])

    const callA = callRepository.createInitial({
      telephonyCallId: 'c-a',
      source: 'fake',
      callbackNumber: null,
      mailboxId: 'mb-a',
      tenantId,
    })
    callRepository.createInitial({
      telephonyCallId: 'c-b',
      source: 'fake',
      callbackNumber: null,
      mailboxId: 'mb-b',
      tenantId,
    })

    const service = new CallReviewService()
    assert.deepEqual(
      service.listCalls({}, member).map(call => call.id),
      [callA.id]
    )
    assert.equal(service.listCalls({}, admin).length, 2)

    // The member can open their own call but not one in a mailbox they lack.
    assert.equal(service.getCallDetail(callA.id, member).call.id, callA.id)
    const callB = callRepository.getByTelephonyCallId('c-b')!
    assert.throws(
      () => service.getCallDetail(callB.id, member),
      /Call not found/
    )
  })

  await runTest('tenant isolation hides another tenant\'s calls', async () => {
    const { db, ensurePrimaryTenant } = await getModules()
    const { tenantRepository } = await import(
      './repositories/tenantRepository.js'
    )
    const { userRepository } = await import('./repositories/userRepository.js')
    const { callRepository } = await import('./repositories/callRepository.js')
    const { CallReviewService } = await import('./services/callReviewService.js')

    const tenantA = ensurePrimaryTenant({ name: 'Primary', slug: 'primary' })
    const tenantB = tenantRepository.create({ name: 'Acme', slug: 'acme' }).id

    const now = new Date().toISOString()
    const insertMailbox = db.prepare(`
      INSERT INTO mailboxes (id, name, number, greeting_prompt_id, sip_account_ref, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insertMailbox.run('mb-a', 'A', null, null, null, tenantA, now, now)
    insertMailbox.run('mb-b', 'B', null, null, null, tenantB, now, now)

    // Each tenant's admin sees only their own mailbox's calls.
    const adminA = userRepository.create({
      email: 'a-admin@example.com',
      displayName: 'A',
      passwordHash: null,
      role: 'admin',
      tenantId: tenantA,
    })
    const adminB = userRepository.create({
      email: 'b-admin@example.com',
      displayName: 'B',
      passwordHash: null,
      role: 'admin',
      tenantId: tenantB,
    })

    const callA = callRepository.createInitial({
      telephonyCallId: 'iso-a',
      source: 'fake',
      callbackNumber: null,
      mailboxId: 'mb-a',
      tenantId: tenantA,
    })
    const callB = callRepository.createInitial({
      telephonyCallId: 'iso-b',
      source: 'fake',
      callbackNumber: null,
      mailboxId: 'mb-b',
      tenantId: tenantB,
    })

    const service = new CallReviewService()
    assert.deepEqual(
      service.listCalls({}, adminA).map(call => call.id),
      [callA.id]
    )
    assert.deepEqual(
      service.listCalls({}, adminB).map(call => call.id),
      [callB.id]
    )
    // Admin A cannot open tenant B's call — 404, not a leak.
    assert.throws(
      () => service.getCallDetail(callB.id, adminA),
      /Call not found/
    )
  })

  await runTest('did provisioning binds a DID to a mailbox and reverses', async () => {
    const { ensurePrimaryTenant } = await getModules()
    const { DidProvisioningService } = await import(
      './services/didProvisioningService.js'
    )
    const { FakeSipTrunkProvider } = await import('./providers/sip/fake.js')
    const { mailboxRepository } = await import(
      './repositories/mailboxRepository.js'
    )
    const { didRepository } = await import('./repositories/didRepository.js')

    const tenantId = ensurePrimaryTenant({ name: 'Primary', slug: 'primary' })
    const service = new DidProvisioningService(
      new FakeSipTrunkProvider(['+15550102000'])
    )

    const did = await service.provision(tenantId, {
      number: '+15550102000',
      mailboxName: 'Forwarded line',
    })
    assert.equal(did.number, '+15550102000')
    assert.equal(did.status, 'active')
    assert.ok(did.mailboxId)

    // A mailbox now routes that DID, scoped to the tenant.
    const mailbox = mailboxRepository.getByNumber('+15550102000')
    assert.ok(mailbox)
    assert.equal(mailbox!.id, did.mailboxId)
    assert.deepEqual(
      service.listForTenant(tenantId).map(d => d.number),
      ['+15550102000']
    )

    // Double-provisioning the same number is rejected.
    await assert.rejects(
      () => service.provision(tenantId, { number: '+15550102000' }),
      /already provisioned/
    )

    // Releasing reverses routing and marks the DID released.
    await service.release(tenantId, '+15550102000')
    assert.equal(didRepository.getByNumber('+15550102000')!.status, 'released')
    assert.equal(mailboxRepository.getByNumber('+15550102000'), null)
  })

  await runTest('usage metering aggregates with markup', async () => {
    const { ensurePrimaryTenant } = await getModules()
    const { UsageService } = await import('./services/usageService.js')
    const { tenantLimitsRepository } = await import(
      './repositories/tenantLimitsRepository.js'
    )

    const tenantId = ensurePrimaryTenant({ name: 'Primary', slug: 'primary' })
    tenantLimitsRepository.update(tenantId, { markupBps: 20000 }) // 2x
    const usage = new UsageService()

    usage.recordInboundMinutes(tenantId, 3, 'call-x') // 3 min @ 1c = 3c carrier
    usage.recordVoicemailProcessing(tenantId, 'call-x') // stt + llm

    const summary = usage.summary(tenantId)
    const minutes = summary.lines.find(l => l.type === 'inbound_minute')!
    assert.equal(minutes.carrierCents, 3)
    assert.equal(minutes.billedCents, 6) // 2x markup
    assert.ok(summary.totalBilledCents >= summary.totalCarrierCents)
    assert.ok(summary.lines.some(l => l.type === 'stt'))
    assert.equal(usage.minutesThisMonth(tenantId), 3)
  })

  await runTest('did limit blocks provisioning beyond the plan', async () => {
    const { ensurePrimaryTenant } = await getModules()
    const { DidProvisioningService } = await import(
      './services/didProvisioningService.js'
    )
    const { FakeSipTrunkProvider } = await import('./providers/sip/fake.js')
    const { tenantLimitsRepository } = await import(
      './repositories/tenantLimitsRepository.js'
    )

    const tenantId = ensurePrimaryTenant({ name: 'Primary', slug: 'primary' })
    tenantLimitsRepository.update(tenantId, { maxDids: 1 })
    const service = new DidProvisioningService(
      new FakeSipTrunkProvider(['+15550109001', '+15550109002'])
    )

    await service.provision(tenantId, { number: '+15550109001' })
    await assert.rejects(
      () => service.provision(tenantId, { number: '+15550109002' }),
      /DID limit reached/
    )
  })

  await runTest('concurrency enforces per-tenant and trunk caps', async () => {
    await getModules()
    const { ConcurrencyService } = await import(
      './services/concurrencyService.js'
    )
    const { tenantLimitsRepository } = await import(
      './repositories/tenantLimitsRepository.js'
    )
    const { ensurePrimaryTenant } = await getModules()

    const tenantId = ensurePrimaryTenant({ name: 'Primary', slug: 'primary' })
    tenantLimitsRepository.update(tenantId, { maxConcurrentCalls: 2 })
    const concurrency = new ConcurrencyService()

    assert.equal(concurrency.tryBegin(tenantId, 'c1'), true)
    assert.equal(concurrency.tryBegin(tenantId, 'c2'), true)
    assert.equal(concurrency.tryBegin(tenantId, 'c3'), false) // tenant cap
    assert.equal(concurrency.activeForTenant(tenantId), 2)

    concurrency.end('c1')
    assert.equal(concurrency.tryBegin(tenantId, 'c3'), true) // freed a slot
  })

  await runTest('did rental is charged once per month and draws the wallet', async () => {
    const { ensurePrimaryTenant } = await getModules()
    const { DidProvisioningService } = await import(
      './services/didProvisioningService.js'
    )
    const { FakeSipTrunkProvider } = await import('./providers/sip/fake.js')
    const { UsageService } = await import('./services/usageService.js')

    const { tenantLimitsRepository } = await import(
      './repositories/tenantLimitsRepository.js'
    )
    const tenantId = ensurePrimaryTenant({ name: 'Primary', slug: 'primary' })
    tenantLimitsRepository.update(tenantId, { maxDids: 10 })
    const service = new DidProvisioningService(
      new FakeSipTrunkProvider(['+15550107000'])
    )
    await service.provision(tenantId, { number: '+15550107000' })

    const usage = new UsageService()
    const before = usage.totalBilledCents(tenantId)
    usage.sweepDidRentals()
    const afterOne = usage.totalBilledCents(tenantId)
    usage.sweepDidRentals() // idempotent — same month, no double charge
    const afterTwo = usage.totalBilledCents(tenantId)

    assert.ok(afterOne > before, 'rental should be charged once')
    assert.equal(afterOne, afterTwo, 'second sweep must not double-charge')

    // Next month charges again.
    usage.sweepDidRentals(new Date(Date.now() + 32 * 24 * 60 * 60 * 1000))
    assert.ok(usage.totalBilledCents(tenantId) > afterTwo)
  })

  await runTest('stripe wallet credits on webhook and draws down on usage', async () => {
    const { ensurePrimaryTenant } = await getModules()
    const { BillingService } = await import('./services/billingService.js')
    const { UsageService } = await import('./services/usageService.js')

    const tenantId = ensurePrimaryTenant({ name: 'Primary', slug: 'primary' })
    const billing = new BillingService()
    const usage = new UsageService()

    // No prior test credits this wallet, so creditCents starts at 0.
    assert.equal(billing.wallet(tenantId).creditCents, 0)

    // A verified payment webhook credits the wallet (idempotent on event id).
    const event = JSON.stringify({
      id: 'evt_1',
      type: 'payment_succeeded',
      tenantId,
      amountCents: 5000,
    })
    await billing.handleWebhook(event, undefined)
    await billing.handleWebhook(event, undefined) // replay must not double-credit
    assert.equal(billing.wallet(tenantId).creditCents, 5000)

    // balance is always credit minus billed usage.
    const before = billing.wallet(tenantId)
    assert.equal(before.balanceCents, 5000 - before.billedCents)

    // Recording usage draws the balance down by the newly billed amount.
    usage.recordInboundMinutes(tenantId, 10, 'c')
    const after = billing.wallet(tenantId)
    assert.ok(after.billedCents > before.billedCents)
    assert.equal(after.balanceCents, 5000 - after.billedCents)

    // A bad webhook body is ignored, not credited.
    await billing.handleWebhook(JSON.stringify({ type: 'noise' }), undefined)
    assert.equal(billing.wallet(tenantId).creditCents, 5000)
  })

  await runTest(
    'self-registration is atomic and leaves no tenant when an audit write fails',
    async () => {
      const { db } = await getModules()
      const { config } = await import('./config.js')
      const { RegistrationService } = await import(
        './services/registrationService.js'
      )

      const previous = {
        enabled: config.selfRegistration.enabled,
        required: config.auth.required,
        localEnabled: config.auth.localEnabled,
        emailEnabled: config.email.notificationsEnabled,
        sessionSecret: config.auth.sessionSecret,
      }
      config.selfRegistration.enabled = true

      const email = {
        async sendEmailVerification() {
          return true
        },
      }
      const service = new RegistrationService(email)
      config.auth.required = false
      assert.throws(() => service.assertConfiguration(), /AUTH_REQUIRED/)
      config.auth.required = true
      config.auth.localEnabled = false
      assert.throws(() => service.assertConfiguration(), /LOCAL_ENABLED/)
      config.auth.localEnabled = true
      config.email.notificationsEnabled = false
      assert.throws(() => service.assertConfiguration(), /EMAIL_NOTIFICATIONS/)
      config.email.notificationsEnabled = true
      const { DEV_SESSION_SECRET } = await import('./config.js')
      config.auth.sessionSecret = DEV_SESSION_SECRET
      assert.throws(() => service.assertConfiguration(), /AUTH_SESSION_SECRET/)
      config.auth.sessionSecret = 'test-session-secret'
      service.assertConfiguration()
      db.exec(`
        CREATE TEMP TRIGGER fail_self_registration_audit
        BEFORE INSERT ON audit_log
        WHEN NEW.action = 'tenant.self_register'
        BEGIN
          SELECT RAISE(FAIL, 'forced audit failure');
        END;
      `)

      try {
        await assert.rejects(
          () =>
            service.register({
              email: 'rollback@example.com',
              password: 'correct-horse-battery-staple',
              organizationName: 'Rollback Co',
            }),
          /forced audit failure/
        )
        const tenantCount = db
          .prepare('SELECT COUNT(*) AS count FROM tenants')
          .get() as { count: number }
        const userCount = db
          .prepare('SELECT COUNT(*) AS count FROM users')
          .get() as { count: number }
        assert.equal(tenantCount.count, 0)
        assert.equal(userCount.count, 0)
      } finally {
        db.exec('DROP TRIGGER IF EXISTS fail_self_registration_audit')
        config.selfRegistration.enabled = previous.enabled
        config.auth.required = previous.required
        config.auth.localEnabled = previous.localEnabled
        config.email.notificationsEnabled = previous.emailEnabled
        config.auth.sessionSecret = previous.sessionSecret
      }
    }
  )

  await runTest(
    'hostile signup stays gated until verified and funded, then caps and disputes freeze it',
    async () => {
      const { db } = await getModules()
      const { config } = await import('./config.js')
      const { RegistrationService } = await import(
        './services/registrationService.js'
      )
      const { BillingService } = await import('./services/billingService.js')
      const { FakeBillingProvider } = await import(
        './providers/billing/fake.js'
      )
      const { tenantLimitsRepository } = await import(
        './repositories/tenantLimitsRepository.js'
      )
      const { tenantRepository } = await import(
        './repositories/tenantRepository.js'
      )
      const { auditRepository } = await import(
        './repositories/auditRepository.js'
      )
      const { userRepository } = await import(
        './repositories/userRepository.js'
      )
      const { billingAlertRepository } = await import(
        './repositories/billingAlertRepository.js'
      )

      const previous = {
        enabled: config.selfRegistration.enabled,
        required: config.auth.required,
        localEnabled: config.auth.localEnabled,
        emailEnabled: config.email.notificationsEnabled,
        emailTo: [...config.email.to],
        defaultMaxDids: config.defaultTenantLimits.maxDids,
        sessionSecret: config.auth.sessionSecret,
      }
      config.selfRegistration.enabled = true
      config.auth.required = true
      config.auth.localEnabled = true
      config.email.notificationsEnabled = true
      config.email.to = ['owner@example.com']
      config.auth.sessionSecret = 'test-session-secret'
      config.defaultTenantLimits.maxDids = 99

      const delivered = {
        verifications: [] as Array<{ email: string; token: string }>,
        freezes: [] as Array<{ tenantId: string; reason: string }>,
        async sendEmailVerification(email: string, token: string) {
          this.verifications.push({ email, token })
          return true
        },
        async sendTenantFrozenAlert(input: {
          tenantName: string
          tenantId: string
          reason: string
        }) {
          void input.tenantName
          this.freezes.push({ tenantId: input.tenantId, reason: input.reason })
          return true
        },
      }

      try {
        const registration = new RegistrationService(delivered)
        const registered = await registration.register({
          email: 'hostile@example.com',
          password: 'correct-horse-battery-staple',
          organizationName: 'Hostile Dry Run',
        })
        assert.equal(registered.user.emailVerified, false)
        assert.equal(registered.verificationRequired, true)
        assert.equal(delivered.verifications.length, 1)
        const storedToken = db
          .prepare(
            'SELECT email_verification_token AS token FROM users WHERE id = ?'
          )
          .get(registered.user.id) as { token: string }
        assert.notEqual(storedToken.token, delivered.verifications[0]!.token)
        assert.equal(storedToken.token.length, 64)

        const limits = tenantLimitsRepository.get(registered.tenant.id)
        assert.equal(limits.maxDids, 1)
        assert.equal(limits.maxConcurrentCalls, 2)

        const authorization = {
          Authorization: `Bearer ${registered.token}`,
        }
        await withServer(async baseUrl => {
          const unverified = await requestJson(baseUrl, '/api/dids', {
            method: 'POST',
            headers: authorization,
            body: JSON.stringify({ number: '+15550102000' }),
          })
          assert.equal(unverified.response.status, 403)
          assert.match(String(unverified.body?.error), /Verify your email/i)

          await registration.resendVerification('hostile@example.com')
          assert.equal(delivered.verifications.length, 2)
          assert.throws(
            () => registration.verifyEmail(delivered.verifications[0]!.token),
            /Invalid or expired/
          )
          const verified = registration.verifyEmail(
            delivered.verifications[1]!.token
          )
          assert.equal(verified.emailVerified, true)

          const unfunded = await requestJson(baseUrl, '/api/dids', {
            method: 'POST',
            headers: authorization,
            body: JSON.stringify({ number: '+15550102000' }),
          })
          assert.equal(unfunded.response.status, 402)

          const billing = new BillingService(
            new FakeBillingProvider(),
            delivered
          )
          await assert.rejects(
            () => billing.startTopUp(registered.tenant.id, 10100),
            /limited to \$100\.00/
          )
          await billing.startTopUp(registered.tenant.id, 10000)
          await billing.startTopUp(registered.tenant.id, 10000)
          await billing.handleWebhook(
            JSON.stringify({
              id: 'evt-hostile-funded-1',
              type: 'payment_succeeded',
              tenantId: registered.tenant.id,
              amountCents: 10000,
            }),
            undefined
          )
          await billing.handleWebhook(
            JSON.stringify({
              id: 'evt-hostile-funded-2',
              type: 'payment_succeeded',
              tenantId: registered.tenant.id,
              amountCents: 10000,
            }),
            undefined
          )
          await assert.rejects(
            () => billing.startTopUp(registered.tenant.id, 500),
            /self-service funding limit/
          )

          const provisioned = await requestJson(baseUrl, '/api/dids', {
            method: 'POST',
            headers: authorization,
            body: JSON.stringify({ number: '+15550102000' }),
          })
          assert.equal(provisioned.response.status, 201)
          const capped = await requestJson(baseUrl, '/api/dids', {
            method: 'POST',
            headers: authorization,
            body: JSON.stringify({ number: '+15550102001' }),
          })
          assert.equal(capped.response.status, 403)
          assert.match(String(capped.body?.error), /DID limit reached/)

          const changed = await registration.updateLocalProfile(
            userRepository.getById(registered.user.id)!,
            {
              displayName: 'Hostile Dry Run',
              email: 'hostile-new@example.com',
            }
          )
          assert.equal(changed.emailVerified, false)
          const blockedAfterEmailChange = await requestJson(
            baseUrl,
            '/api/billing/topup',
            {
              method: 'POST',
              headers: authorization,
              body: JSON.stringify({ amountCents: 500 }),
            }
          )
          assert.equal(blockedAfterEmailChange.response.status, 403)
          registration.verifyEmail(delivered.verifications.at(-1)!.token)

          await billing.handleWebhook(
            JSON.stringify({
              id: 'evt-hostile-dispute',
              type: 'payment_disputed',
              tenantId: registered.tenant.id,
              amountCents: 10000,
            }),
            undefined
          )
        })

        assert.equal(
          tenantRepository.getById(registered.tenant.id)?.status,
          'suspended'
        )
        assert.equal(delivered.freezes.length, 1)
        assert.ok(billingAlertRepository.get('evt-hostile-dispute')?.sentAt)
        assert.ok(
          auditRepository
            .listByTenant(registered.tenant.id)
            .some(entry => entry.action === 'tenant.freeze')
        )
      } finally {
        config.selfRegistration.enabled = previous.enabled
        config.auth.required = previous.required
        config.auth.localEnabled = previous.localEnabled
        config.email.notificationsEnabled = previous.emailEnabled
        config.email.to = previous.emailTo
        config.defaultTenantLimits.maxDids = previous.defaultMaxDids
        config.auth.sessionSecret = previous.sessionSecret
      }
    }
  )

  await runTest('requireAdmin blocks non-admins', async () => {
    const { requireAdmin } = await import('./middleware/requireAdmin.js')

    function run(role: 'admin' | 'member') {
      const result = { status: 0, nexted: false }
      const response = {
        locals: {
          user: {
            id: 'u',
            email: 'e@example.com',
            displayName: null,
            role,
            authProvider: 'local',
          },
        },
        status(code: number) {
          result.status = code
          return this
        },
        json() {
          return this
        },
      }
      requireAdmin({} as never, response as never, () => {
        result.nexted = true
      })
      return result
    }

    const member = run('member')
    assert.equal(member.status, 403)
    assert.equal(member.nexted, false)

    const admin = run('admin')
    assert.equal(admin.nexted, true)
  })

  await runTest(
    'sso provisioning creates users, promotes admins, syncs mapped groups',
    async () => {
      const { SsoService } = await import('./services/ssoService.js')
      const { groupRepository } = await import(
        './repositories/groupRepository.js'
      )
      const { userRepository } = await import('./repositories/userRepository.js')
      const { ensurePrimaryTenant } = await import('./db/client.js')
      type SsoIdentity = import('./providers/auth/types.js').SsoIdentity
      type SsoProvider = import('./providers/auth/types.js').SsoProvider

      const tenantId = ensurePrimaryTenant({ name: 'Primary', slug: 'primary' })
      const opsGroup = groupRepository.create({ name: 'Ops', tenantId })
      groupRepository.setMappings([
        { externalName: 'ops', groupId: opsGroup.id },
      ])

      class FakeProvider implements SsoProvider {
        readonly id = 'oidc' as const
        readonly label = 'Fake'
        constructor(private readonly identity: SsoIdentity) {}
        async start() {
          return {
            redirectUrl: 'https://idp/authorize',
            state: `state-${this.identity.email}`,
            nonce: null,
            codeVerifier: null,
          }
        }
        async complete() {
          return this.identity
        }
      }

      // boss is in AUTH_ADMIN_EMAILS and carries the mapped "ops" group.
      const bossSvc = new SsoService([
        new FakeProvider({
          email: 'boss@example.com',
          displayName: 'Boss',
          externalId: 'sub-boss',
          groups: ['ops'],
        }),
      ])
      await bossSvc.start('oidc')
      const boss = await bossSvc.complete('oidc', {
        callbackUrl: 'https://app/cb',
        state: 'state-boss@example.com',
      })
      assert.equal(boss.user.email, 'boss@example.com')
      assert.equal(boss.user.role, 'admin')
      assert.ok(boss.token)
      assert.ok(
        groupRepository
          .getDetail(opsGroup.id)!
          .members.some(m => m.email === 'boss@example.com')
      )

      // A non-allowlisted user with no mapped groups stays a member.
      const workerSvc = new SsoService([
        new FakeProvider({
          email: 'worker@example.com',
          displayName: 'Worker',
          externalId: 'sub-worker',
          groups: [],
        }),
      ])
      await workerSvc.start('oidc')
      const worker = await workerSvc.complete('oidc', {
        callbackUrl: 'https://app/cb',
        state: 'state-worker@example.com',
      })
      assert.equal(worker.user.role, 'member')
      assert.equal(userRepository.getByEmail('worker@example.com')?.authProvider, 'oidc')
    }
  )

  await runTest('auth providers endpoint reflects config', async () => {
    await withServer(async baseUrl => {
      const providers = await requestJson(baseUrl, '/api/auth/providers')
      const providersBody = providers.body as {
        localEnabled: boolean
        providers: unknown[]
      }
      assert.equal(providers.response.status, 200)
      assert.equal(providersBody.localEnabled, true)
      assert.deepEqual(providersBody.providers, [])

      const me = await requestJson(baseUrl, '/api/auth/me')
      const meBody = me.body as {
        authRequired: boolean
        localEnabled: boolean
        providers: unknown[]
      }
      assert.equal(meBody.authRequired, false)
      assert.equal(meBody.localEnabled, true)
      assert.deepEqual(meBody.providers, [])
    })
  })

  await runTest('groups can be created and granted mailboxes', async () => {
    await withServer(async baseUrl => {
      const mailboxes = await requestJson(baseUrl, '/api/mailboxes')
      const mailboxId = (mailboxes.body as { items: { id: string }[] })
        .items[0]!.id

      const created = await requestJson(baseUrl, '/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: 'Support' }),
      })
      assert.equal(created.response.status, 201)
      const groupId = (created.body as { group: { id: string } }).group.id

      const granted = await requestJson(
        baseUrl,
        `/api/groups/${groupId}/mailboxes`,
        { method: 'PUT', body: JSON.stringify({ mailboxIds: [mailboxId] }) }
      )
      assert.equal(granted.response.status, 200)
      const grantedBody = granted.body as {
        group: { mailboxes: { id: string }[] }
      }
      assert.deepEqual(
        grantedBody.group.mailboxes.map(mailbox => mailbox.id),
        [mailboxId]
      )

      const list = await requestJson(baseUrl, '/api/groups')
      assert.equal((list.body as { items: unknown[] }).items.length, 1)
    })
  })

  await runTest('inbound calls route to a mailbox by dialed DID', async () => {
    await withServer(async baseUrl => {
      await requestJson(baseUrl, '/api/settings/engines', {
        method: 'PATCH',
        body: JSON.stringify({
          llm: { provider: 'fake', model: null },
          stt: { provider: 'fake', model: null },
          tts: { provider: 'fake', model: null, voice: null },
        }),
      })

      const initial = await requestJson(baseUrl, '/api/mailboxes')
      const defaultMailboxId = (initial.body as { items: { id: string }[] })
        .items[0]!.id

      const created = await requestJson(baseUrl, '/api/mailboxes', {
        method: 'POST',
        body: JSON.stringify({ name: 'Sales', number: '+19998887777' }),
      })
      const salesMailboxId = (created.body as { mailbox: { id: string } })
        .mailbox.id

      // A call dialing the Sales DID lands in the Sales mailbox.
      await requestJson(baseUrl, '/api/webhooks/telephony/inbound', {
        method: 'POST',
        body: JSON.stringify({
          telephonyCallId: 'route-sales',
          source: 'fake',
          fromNumber: '+15551112222',
          toNumber: '+19998887777',
          transcript: 'Hi, calling about a sales quote.',
        }),
      })
      // A call with no/unknown DID falls back to the default mailbox.
      await requestJson(baseUrl, '/api/webhooks/telephony/inbound', {
        method: 'POST',
        body: JSON.stringify({
          telephonyCallId: 'route-default',
          source: 'fake',
          fromNumber: '+15553334444',
          transcript: 'Hi, just a general question.',
        }),
      })

      const list = await requestJson(baseUrl, '/api/calls')
      const items = (list.body as { items: { id: string }[] }).items
      const mailboxOf = async (telephonyCallId: string) => {
        for (const item of items) {
          const detail = await requestJson(baseUrl, `/api/calls/${item.id}`)
          const call = (detail.body as { call: { telephonyCallId: string; mailboxId: string } }).call
          if (call.telephonyCallId === telephonyCallId) return call.mailboxId
        }
        return null
      }

      assert.equal(await mailboxOf('route-sales'), salesMailboxId)
      assert.equal(await mailboxOf('route-default'), defaultMailboxId)
    })
  })

  await runTest('mailboxes can be created but never the last deleted', async () => {
    await withServer(async baseUrl => {
      const before = await requestJson(baseUrl, '/api/mailboxes')
      const defaultId = (before.body as { items: { id: string }[] }).items[0]!.id

      const created = await requestJson(baseUrl, '/api/mailboxes', {
        method: 'POST',
        body: JSON.stringify({ name: 'Support', number: '+18005551234' }),
      })
      assert.equal(created.response.status, 201)
      const supportId = (created.body as { mailbox: { id: string } }).mailbox.id

      const two = await requestJson(baseUrl, '/api/mailboxes')
      assert.equal((two.body as { items: unknown[] }).items.length, 2)

      const del = await fetch(`${baseUrl}/api/mailboxes/${supportId}`, {
        method: 'DELETE',
      })
      assert.equal(del.status, 204)

      // Deleting the only remaining mailbox is refused.
      const delLast = await requestJson(baseUrl, `/api/mailboxes/${defaultId}`, {
        method: 'DELETE',
      })
      assert.equal(delLast.response.status, 400)
      assert.match(
        String((delLast.body as { error?: string } | null)?.error),
        /only mailbox/
      )
    })
  })

  await runTest('user management creates users and protects the last admin', async () => {
    await withServer(async baseUrl => {
      const admin = await requestJson(baseUrl, '/api/users', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'supersecret',
          role: 'admin',
        }),
      })
      assert.equal(admin.response.status, 201)
      const adminId = (admin.body as { user: { id: string } }).user.id

      const member = await requestJson(baseUrl, '/api/users', {
        method: 'POST',
        body: JSON.stringify({
          email: 'member@example.com',
          password: 'supersecret',
          role: 'member',
        }),
      })
      assert.equal(member.response.status, 201)

      const list = await requestJson(baseUrl, '/api/users')
      assert.equal((list.body as { items: unknown[] }).items.length, 2)

      // The new member is assignable to groups.
      const assignable = await requestJson(baseUrl, '/api/groups/users')
      assert.ok(
        (assignable.body as { items: { email: string }[] }).items.some(
          u => u.email === 'member@example.com'
        )
      )

      // The sole admin can't be demoted or deleted.
      const demote = await requestJson(baseUrl, `/api/users/${adminId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'member' }),
      })
      assert.equal(demote.response.status, 400)
      const remove = await requestJson(baseUrl, `/api/users/${adminId}`, {
        method: 'DELETE',
      })
      assert.equal(remove.response.status, 400)
    })
  })

  await runTest('reviewing a call records who reviewed it', async () => {
    await withServer(async baseUrl => {
      await requestJson(baseUrl, '/api/settings/engines', {
        method: 'PATCH',
        body: JSON.stringify({
          llm: { provider: 'fake', model: null },
          stt: { provider: 'fake', model: null },
          tts: { provider: 'fake', model: null, voice: null },
        }),
      })
      await requestJson(baseUrl, '/api/webhooks/telephony/inbound', {
        method: 'POST',
        body: JSON.stringify({
          telephonyCallId: 'attrib-1',
          source: 'fake',
          fromNumber: '+15550000000',
          transcript: 'Please call me back.',
        }),
      })

      const list = await requestJson(baseUrl, '/api/calls')
      const callId = (list.body as { items: { id: string }[] }).items[0]!.id

      await requestJson(baseUrl, `/api/calls/${callId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'reviewed' }),
      })

      const detail = await requestJson(baseUrl, `/api/calls/${callId}`)
      const call = (detail.body as { call: { reviewedBy: string | null } }).call
      // Open-mode identity reviews as "Open Mode".
      assert.equal(call.reviewedBy, 'Open Mode')
    })
  })

  await runTest(
    'password reset consumes its token once and revokes existing sessions',
    async () => {
      const { ensurePrimaryTenant } = await getModules()
      const { config } = await import('./config.js')
      const { PasswordResetService } = await import(
        './services/passwordResetService.js'
      )
      const { userRepository } = await import(
        './repositories/userRepository.js'
      )
      const { hashPassword, verifyPassword } = await import(
        './lib/password.js'
      )
      const { signSessionToken } = await import('./lib/token.js')
      const { resolveSessionUser } = await import('./services/authService.js')

      const tenantId = ensurePrimaryTenant(config.defaultTenant)
      const sent: Array<{ email: string; token: string }> = []
      const service = new PasswordResetService({
        async sendPasswordReset(email: string, token: string) {
          sent.push({ email, token })
          return true
        },
      })

      const local = userRepository.create({
        email: 'reset-me@example.com',
        displayName: 'Reset Me',
        passwordHash: hashPassword('original-password'),
        role: 'member',
        tenantId,
      })
      const sso = userRepository.create({
        email: 'sso-user@example.com',
        displayName: 'SSO User',
        passwordHash: null,
        role: 'member',
        tenantId,
        authProvider: 'oidc',
      })

      // A session issued before the reset.
      const oldToken = signSessionToken(local.id, local.sessionEpoch)
      assert.equal(resolveSessionUser(oldToken)?.id, local.id)

      // Unknown addresses and SSO accounts are silent no-ops: no mail, no throw.
      await service.request('nobody@example.com')
      await service.request(sso.email)
      assert.equal(sent.length, 0)

      await service.request(local.email)
      assert.equal(sent.length, 1)
      const token = sent[0]!.token

      service.reset(token, 'a-brand-new-password')

      const updated = userRepository.getById(local.id)!
      assert.ok(verifyPassword('a-brand-new-password', updated.passwordHash!))
      // The pre-reset session must no longer resolve — that is the whole point.
      assert.equal(resolveSessionUser(oldToken), null)
      assert.equal(
        resolveSessionUser(signSessionToken(local.id, updated.sessionEpoch))?.id,
        local.id
      )
      // The token is single-use.
      assert.throws(
        () => service.reset(token, 'yet-another-password'),
        /Invalid or expired/
      )

      userRepository.remove(local.id)
      userRepository.remove(sso.id)
    }
  )

  await runTest('totp matches RFC 6238 vectors and tolerates clock skew', async () => {
    const { totpCodeForCounter, verifyTotp, base32Encode, base32Decode } =
      await import('./lib/totp.js')

    // RFC 6238 appendix B: the SHA-1 secret is the ASCII "12345678901234567890".
    const secret = base32Encode(Buffer.from('12345678901234567890'))
    assert.equal(base32Decode(secret).toString(), '12345678901234567890')
    // T=59s and T=1111111109s fall in steps 1 and 37037036.
    assert.equal(totpCodeForCounter(secret, 1), '287082')
    assert.equal(totpCodeForCounter(secret, 37037036), '081804')

    // Codes one step either side are accepted; two steps away is not.
    const now = 37037036 * 30 * 1000
    assert.equal(verifyTotp(secret, '081804', now), true)
    assert.equal(verifyTotp(secret, totpCodeForCounter(secret, 37037035), now), true)
    assert.equal(verifyTotp(secret, totpCodeForCounter(secret, 37037037), now), true)
    assert.equal(verifyTotp(secret, totpCodeForCounter(secret, 37037034), now), false)
    assert.equal(verifyTotp(secret, 'abcdef', now), false)
  })

  await runTest(
    'mfa gates login and recovery codes are single-use',
    async () => {
      const { ensurePrimaryTenant } = await getModules()
      const { config } = await import('./config.js')
      const { AuthService } = await import('./services/authService.js')
      const { MfaService } = await import('./services/mfaService.js')
      const { userRepository } = await import(
        './repositories/userRepository.js'
      )
      const { hashPassword } = await import('./lib/password.js')
      const { currentTotpCode } = await import('./lib/totp.js')
      const { verifySignedToken } = await import('./lib/token.js')

      const tenantId = ensurePrimaryTenant(config.defaultTenant)
      const mfaService = new MfaService()
      const authService = new AuthService(undefined, mfaService)

      const created = userRepository.create({
        email: 'mfa-user@example.com',
        displayName: 'MFA User',
        passwordHash: hashPassword('correct-horse-battery-staple'),
        role: 'member',
        tenantId,
      })

      // Without MFA the password alone completes the login.
      const plain = await authService.login(
        'mfa-user@example.com',
        'correct-horse-battery-staple'
      )
      assert.ok('token' in plain)

      const { secret } = mfaService.beginEnrollment(created.id, 'ComFlow')
      // Enrollment is not live until a valid code confirms it.
      const stillPlain = await authService.login(
        'mfa-user@example.com',
        'correct-horse-battery-staple'
      )
      assert.ok('token' in stillPlain)
      assert.throws(
        () => mfaService.confirmEnrollment(created.id, '000000'),
        /not valid/
      )

      const { recoveryCodes } = mfaService.confirmEnrollment(
        created.id,
        currentTotpCode(secret)
      )
      assert.equal(recoveryCodes.length, 10)

      const challenged = await authService.login(
        'mfa-user@example.com',
        'correct-horse-battery-staple'
      )
      assert.ok('mfaRequired' in challenged)
      const challengeToken = (challenged as { challengeToken: string })
        .challengeToken
      // An MFA challenge must never be usable as a session token.
      assert.equal(verifySignedToken(challengeToken, 'session'), null)

      assert.throws(
        () => authService.completeMfaLogin(challengeToken, '000000'),
        /Invalid verification code/
      )
      const granted = authService.completeMfaLogin(
        challengeToken,
        currentTotpCode(secret)
      )
      assert.equal(granted.user.id, created.id)

      // A recovery code works once, then is consumed.
      const second = await authService.login(
        'mfa-user@example.com',
        'correct-horse-battery-staple'
      )
      const secondToken = (second as { challengeToken: string }).challengeToken
      assert.ok(authService.completeMfaLogin(secondToken, recoveryCodes[0]!))
      assert.equal(
        userRepository.getById(created.id)!.totpRecoveryCodes.length,
        9
      )
      const third = await authService.login(
        'mfa-user@example.com',
        'correct-horse-battery-staple'
      )
      const thirdToken = (third as { challengeToken: string }).challengeToken
      assert.throws(
        () => authService.completeMfaLogin(thirdToken, recoveryCodes[0]!),
        /Invalid verification code/
      )

      mfaService.disable(created.id)
      const afterDisable = await authService.login(
        'mfa-user@example.com',
        'correct-horse-battery-staple'
      )
      assert.ok('token' in afterDisable)

      userRepository.remove(created.id)
    }
  )

  await runTest(
    'subscription webhooks materialize band limits through upgrade, downgrade, and cancel',
    async () => {
      const { ensurePrimaryTenant } = await getModules()
      const { config } = await import('./config.js')
      const { BillingService } = await import('./services/billingService.js')
      const { tenantLimitsRepository } = await import(
        './repositories/tenantLimitsRepository.js'
      )
      const { billingRepository } = await import(
        './repositories/billingRepository.js'
      )
      const { PLAN_CATALOG } = await import('../../shared/src/index.js')

      const tenantId = ensurePrimaryTenant(config.defaultTenant)
      const service = new BillingService(undefined, {
        async sendTenantFrozenAlert() {
          return true
        },
      })

      const period = (band: string, status: string, cancel = false) =>
        JSON.stringify({
          id: `evt-sub-${band}-${status}-${cancel}`,
          type: 'subscription_updated',
          tenantId,
          subscription: {
            stripeSubscriptionId: 'sub_test_1',
            status,
            band,
            currentPeriodStart: '2026-07-01T00:00:00.000Z',
            currentPeriodEnd: '2026-08-01T00:00:00.000Z',
            cancelAtPeriodEnd: cancel,
          },
        })

      // Subscribe to Solo: limits follow the catalog.
      await service.handleWebhook(period('solo', 'active'), undefined)
      let limits = tenantLimitsRepository.get(tenantId)
      assert.equal(limits.maxDids, PLAN_CATALOG.solo.maxDids)
      assert.equal(limits.includedMinutes, PLAN_CATALOG.solo.includedMinutes)
      assert.equal(service.subscription(tenantId).band, 'solo')

      // Upgrade to Business.
      await service.handleWebhook(period('business', 'active'), undefined)
      limits = tenantLimitsRepository.get(tenantId)
      assert.equal(limits.maxDids, PLAN_CATALOG.business.maxDids)
      assert.equal(
        limits.maxConcurrentCalls,
        PLAN_CATALOG.business.maxConcurrentCalls
      )

      // Downgrade back to Pro.
      await service.handleWebhook(period('pro', 'active'), undefined)
      assert.equal(
        tenantLimitsRepository.get(tenantId).maxDids,
        PLAN_CATALOG.pro.maxDids
      )

      // past_due still grants service — Stripe is still retrying.
      await service.handleWebhook(period('pro', 'past_due'), undefined)
      assert.equal(
        tenantLimitsRepository.get(tenantId).maxDids,
        PLAN_CATALOG.pro.maxDids
      )
      assert.equal(service.subscription(tenantId).status, 'past_due')

      // Cancel-at-period-end keeps the band until the period actually ends.
      await service.handleWebhook(period('pro', 'active', true), undefined)
      assert.equal(service.subscription(tenantId).cancelAtPeriodEnd, true)
      assert.equal(
        tenantLimitsRepository.get(tenantId).maxDids,
        PLAN_CATALOG.pro.maxDids
      )

      // Cancellation drops to no-service limits but keeps the tenant.
      await service.handleWebhook(period('pro', 'canceled'), undefined)
      assert.equal(service.subscription(tenantId).band, 'free')
      assert.equal(tenantLimitsRepository.get(tenantId).maxDids, 0)
      assert.ok(billingRepository.get(tenantId).stripeSubscriptionId)

      // Exhausted retries also drop to free, recorded as unpaid.
      await service.handleWebhook(period('pro', 'active'), undefined)
      await service.handleWebhook(
        JSON.stringify({
          id: 'evt-sub-unpaid',
          type: 'subscription_payment_failed',
          tenantId,
        }),
        undefined
      )
      assert.equal(service.subscription(tenantId).status, 'unpaid')
      assert.equal(tenantLimitsRepository.get(tenantId).maxDids, 0)

      // Replaying a processed event must not change anything.
      const before = JSON.stringify(service.subscription(tenantId))
      await service.handleWebhook(
        JSON.stringify({
          id: 'evt-sub-unpaid',
          type: 'subscription_payment_failed',
          tenantId,
        }),
        undefined
      )
      assert.equal(JSON.stringify(service.subscription(tenantId)), before)
    }
  )

  await runTest(
    'outbound is off by default, survives plan changes, and enforces destinations',
    async () => {
      const { ensurePrimaryTenant } = await getModules()
      const { config } = await import('./config.js')
      const { OutboundGuardService } = await import(
        './services/outboundGuardService.js'
      )
      const { tenantLimitsRepository } = await import(
        './repositories/tenantLimitsRepository.js'
      )
      const { tenantRepository } = await import(
        './repositories/tenantRepository.js'
      )
      const { PLAN_CATALOG } = await import('../../shared/src/index.js')

      ensurePrimaryTenant(config.defaultTenant)
      const tenant = tenantRepository.create({
        name: 'Outbound Co',
        slug: `outbound-${Date.now()}`,
        plan: 'solo',
      })
      const guard = new OutboundGuardService()

      // A brand-new tenant may not dial out.
      assert.equal(
        tenantLimitsRepository.get(tenant.id).outboundEnabled,
        false
      )
      assert.throws(
        () => guard.assertAllowed(tenant.id, '+15551234567'),
        /not enabled/
      )

      tenantLimitsRepository.setOutboundEnabled(tenant.id, true)
      guard.assertAllowed(tenant.id, '+15551234567')

      // Destination rules: NANP only, and nothing that isn't a plain number.
      assert.throws(
        () => guard.assertAllowed(tenant.id, '+442071838750'),
        /not enabled for outbound/
      )
      assert.throws(
        () => guard.assertAllowed(tenant.id, '1-555-123-4567'),
        /digits only/
      )
      assert.throws(
        () => guard.assertAllowed(tenant.id, 'sip:victim@example.com'),
        /digits only/
      )

      // A subscription change re-materializes plan limits; the operator's
      // outbound grant must not be collateral damage.
      tenantLimitsRepository.materialize(tenant.id, PLAN_CATALOG.business)
      assert.equal(tenantLimitsRepository.get(tenant.id).outboundEnabled, true)
      assert.equal(
        tenantLimitsRepository.get(tenant.id).maxDids,
        PLAN_CATALOG.business.maxDids
      )

      tenantLimitsRepository.setOutboundEnabled(tenant.id, false)
      assert.throws(
        () => guard.assertAllowed(tenant.id, '+15551234567'),
        /not enabled/
      )
    }
  )

  const { db } = await getModules()
  db.close()
  fs.rmSync(testDataDir, { recursive: true, force: true })
}

void main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
