import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Container,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import SaveIcon from '@mui/icons-material/Save'
import { MailboxesTab } from '../components/MailboxesTab'
import {
  EngineKind,
  EngineReadinessMap,
  EngineSecretKey,
  EngineSecretStatus,
  EngineSecretStatusMap,
  EngineSettings,
  SipRuntimeStatus,
  SipSecretStatusMap,
  SipSettings,
} from '../../../shared/src/index.js'
import {
  getEngineSettings,
  getSipSettings,
  getSipStatus,
  restartSipEdge,
  testEngine,
  updateEngineSettings,
  updateSipSettings,
} from '../lib/api'

const PROVIDER_OPTIONS = {
  llm: [
    { value: 'fake', label: 'Fake' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Claude (Anthropic)' },
  ],
  stt: [
    { value: 'fake', label: 'Fake' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'elevenlabs', label: 'ElevenLabs' },
  ],
  tts: [
    { value: 'fake', label: 'Fake' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'elevenlabs', label: 'ElevenLabs' },
  ],
} as const

const MODEL_HINTS = {
  llm: {
    fake: 'fake',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-sonnet-4-5',
  },
  stt: {
    fake: 'fake',
    openai: 'gpt-4o-mini-transcribe',
    elevenlabs: 'scribe_v2',
  },
  tts: {
    fake: 'fake',
    openai: 'gpt-4o-mini-tts',
    elevenlabs: 'eleven_v3',
  },
} as const

const VOICE_HINTS = {
  fake: 'fake',
  openai: 'alloy',
  elevenlabs: 'JBFqnCBsd6RMkjVDRZzb',
} as const

const EMPTY_SETTINGS: EngineSettings = {
  llm: { provider: 'fake', model: null },
  stt: { provider: 'fake', model: null },
  tts: { provider: 'fake', model: null, voice: null },
}

const EMPTY_READINESS: EngineReadinessMap = {
  llm: {
    provider: 'fake',
    model: null,
    ready: true,
    missingSecrets: [],
  },
  stt: {
    provider: 'fake',
    model: null,
    ready: true,
    missingSecrets: [],
  },
  tts: {
    provider: 'fake',
    model: null,
    voice: null,
    ready: true,
    missingSecrets: [],
  },
}

const EMPTY_SECRET_STATUS: EngineSecretStatusMap = {
  openaiApiKey: {
    configured: false,
    source: 'missing',
  },
  anthropicApiKey: {
    configured: false,
    source: 'missing',
  },
  elevenLabsApiKey: {
    configured: false,
    source: 'missing',
  },
}

const EMPTY_SIP_SETTINGS: SipSettings = {
  enabled: false,
  accountLabel: 'main',
  accountUri: null,
  authUsername: null,
  outboundProxy: null,
  outboundDialingDomain: null,
  registrationInterval: 600,
  preferredCodecs: [],
}

const EMPTY_SIP_SECRET_STATUS: SipSecretStatusMap = {
  authPassword: {
    configured: false,
    source: 'missing',
  },
}

const EMPTY_SIP_STATUS: SipRuntimeStatus = {
  telephonyMode: 'fake',
  controlHost: '127.0.0.1',
  controlPort: 4444,
  controlConnected: false,
  accountsPath: '',
  accountsLastWrittenAt: null,
  restartSupported: false,
  restartMechanism: 'unavailable',
}

const SECRET_FIELDS = [
  {
    key: 'openaiApiKey',
    label: 'OpenAI API key',
    envName: 'COMFLOW_OPENAI_API_KEY',
  },
  {
    key: 'anthropicApiKey',
    label: 'Anthropic API key',
    envName: 'COMFLOW_ANTHROPIC_API_KEY',
  },
  {
    key: 'elevenLabsApiKey',
    label: 'ElevenLabs API key',
    envName: 'COMFLOW_ELEVENLABS_API_KEY',
  },
] as const satisfies readonly {
  key: EngineSecretKey
  label: string
  envName: string
}[]

type SecretInputState = Record<EngineSecretKey, string>

function emptySecretInputs(): SecretInputState {
  return {
    openaiApiKey: '',
    anthropicApiKey: '',
    elevenLabsApiKey: '',
  }
}

function getSecretPatch(inputs: SecretInputState) {
  const patch: Partial<Record<EngineSecretKey, string>> = {}
  for (const field of SECRET_FIELDS) {
    const value = inputs[field.key].trim()
    if (value) {
      patch[field.key] = value
    }
  }

  return Object.keys(patch).length > 0 ? patch : undefined
}

function parsePreferredCodecs(value: string) {
  return value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
}

export function SettingsPage() {
  const [settings, setSettings] = useState<EngineSettings>(EMPTY_SETTINGS)
  const [readiness, setReadiness] = useState<EngineReadinessMap>(EMPTY_READINESS)
  const [secrets, setSecrets] =
    useState<EngineSecretStatusMap>(EMPTY_SECRET_STATUS)
  const [secretInputs, setSecretInputs] =
    useState<SecretInputState>(emptySecretInputs)
  const [sipSettings, setSipSettings] =
    useState<SipSettings>(EMPTY_SIP_SETTINGS)
  const [sipSecrets, setSipSecrets] =
    useState<SipSecretStatusMap>(EMPTY_SIP_SECRET_STATUS)
  const [sipStatus, setSipStatus] =
    useState<SipRuntimeStatus>(EMPTY_SIP_STATUS)
  const [sipPasswordInput, setSipPasswordInput] = useState('')
  const [preferredCodecsText, setPreferredCodecsText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingSip, setSavingSip] = useState(false)
  const [restartingSip, setRestartingSip] = useState(false)
  const [tab, setTab] = useState(0)
  const [clearingSecret, setClearingSecret] = useState<EngineSecretKey | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState<Record<string, boolean>>({})

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [engineResult, sipResult] = await Promise.all([
        getEngineSettings(),
        getSipSettings(),
      ])
      setSettings(engineResult.settings)
      setReadiness(engineResult.readiness)
      setSecrets(engineResult.secrets)
      setSipSettings(sipResult.settings)
      setSipSecrets(sipResult.secrets)
      setSipStatus(sipResult.status)
      setPreferredCodecsText(sipResult.settings.preferredCodecs.join(', '))
      setError(null)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setNotice(null)
    setError(null)

    try {
      const secretPatch = getSecretPatch(secretInputs)
      const result = await updateEngineSettings({
        settings,
        ...(secretPatch ? { secrets: secretPatch } : {}),
      })
      setSettings(result.settings)
      setReadiness(result.readiness)
      setSecrets(result.secrets)
      if (secretPatch) {
        setSecretInputs(emptySecretInputs())
      }
      setNotice('Engine settings saved.')
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveSip() {
    setSavingSip(true)
    setNotice(null)
    setError(null)

    try {
      const password = sipPasswordInput.trim()
      const result = await updateSipSettings({
        settings: sipSettings,
        ...(password ? { secrets: { authPassword: password } } : {}),
      })
      setSipSettings(result.settings)
      setSipSecrets(result.secrets)
      setSipStatus(result.status)
      setPreferredCodecsText(result.settings.preferredCodecs.join(', '))
      if (password) setSipPasswordInput('')
      setNotice('SIP settings saved and accounts file written.')
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setSavingSip(false)
    }
  }

  async function handleRestartSip() {
    setRestartingSip(true)
    setNotice(null)
    setError(null)

    try {
      const result = await restartSipEdge()
      setSipStatus(result.status)
      setNotice(result.message)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setRestartingSip(false)
    }
  }

  async function handleRefreshSipStatus() {
    setNotice(null)
    setError(null)

    try {
      const result = await getSipStatus()
      setSipStatus(result.status)
      setNotice('SIP control status refreshed.')
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  async function handleClearSecret(key: EngineSecretKey) {
    const secretPatch: Partial<Record<EngineSecretKey, null>> = { [key]: null }

    setClearingSecret(key)
    setNotice(null)
    setError(null)

    try {
      const result = await updateEngineSettings({
        settings,
        secrets: secretPatch,
      })
      setSettings(result.settings)
      setReadiness(result.readiness)
      setSecrets(result.secrets)
      setSecretInputs(current => ({ ...current, [key]: '' }))
      setNotice('Saved secret override cleared.')
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setClearingSecret(null)
    }
  }

  async function handleTest(engine: EngineKind) {
    setTesting(current => ({ ...current, [engine]: true }))
    setTestResults(current => ({ ...current, [engine]: '' }))

    try {
      const result = await testEngine(engine)
      setTestResults(current => ({
        ...current,
        [engine]: result.result.message,
      }))
      await load()
    } catch (reason) {
      setTestResults(current => ({
        ...current,
        [engine]: (reason as Error).message,
      }))
    } finally {
      setTesting(current => ({ ...current, [engine]: false }))
    }
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Settings
          </Typography>
          <Typography color="text.secondary">
            Configure AI engines, the SIP/telephony edge, and mailboxes. Env
            defaults apply on first run; saved values take over after that.
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}

        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Engines" />
          <Tab label="Telephony" />
          <Tab label="Mailboxes" />
        </Tabs>

        {tab === 0 && (
          <>
        <Card>
          <CardHeader
            title="Providers"
            subheader="Pick the active engines for extraction, transcription, and synthesized callback audio."
          />
          <CardContent>
            <Stack spacing={3}>
              <EngineEditor
                engine="llm"
                title="LLM engine"
                provider={settings.llm.provider}
                model={settings.llm.model}
                voice={null}
                readiness={readiness.llm}
                testMessage={testResults.llm}
                testing={Boolean(testing.llm)}
                disabled={loading || saving}
                onProviderChange={provider => {
                  const nextProvider = provider as EngineSettings['llm']['provider']
                  setSettings(current => ({
                    ...current,
                    llm: {
                      provider: nextProvider,
                      model:
                        nextProvider === 'fake'
                          ? null
                          : MODEL_HINTS.llm[
                              nextProvider as keyof typeof MODEL_HINTS.llm
                            ],
                    },
                  }))
                }}
                onModelChange={model =>
                  setSettings(current => ({
                    ...current,
                    llm: { ...current.llm, model },
                  }))
                }
                onVoiceChange={() => undefined}
                onTest={() => {
                  void handleTest('llm')
                }}
              />

              <Divider />

              <EngineEditor
                engine="stt"
                title="STT engine"
                provider={settings.stt.provider}
                model={settings.stt.model}
                voice={null}
                readiness={readiness.stt}
                testMessage={testResults.stt}
                testing={Boolean(testing.stt)}
                disabled={loading || saving}
                onProviderChange={provider => {
                  const nextProvider = provider as EngineSettings['stt']['provider']
                  setSettings(current => ({
                    ...current,
                    stt: {
                      provider: nextProvider,
                      model:
                        nextProvider === 'fake'
                          ? null
                          : MODEL_HINTS.stt[
                              nextProvider as keyof typeof MODEL_HINTS.stt
                            ],
                    },
                  }))
                }}
                onModelChange={model =>
                  setSettings(current => ({
                    ...current,
                    stt: { ...current.stt, model },
                  }))
                }
                onVoiceChange={() => undefined}
                onTest={() => {
                  void handleTest('stt')
                }}
              />

              <Divider />

              <EngineEditor
                engine="tts"
                title="TTS engine"
                provider={settings.tts.provider}
                model={settings.tts.model}
                voice={settings.tts.voice}
                readiness={readiness.tts}
                testMessage={testResults.tts}
                testing={Boolean(testing.tts)}
                disabled={loading || saving}
                onProviderChange={provider => {
                  const nextProvider = provider as EngineSettings['tts']['provider']
                  setSettings(current => ({
                    ...current,
                    tts: {
                      provider: nextProvider,
                      model:
                        nextProvider === 'fake'
                          ? null
                          : MODEL_HINTS.tts[
                              nextProvider as keyof typeof MODEL_HINTS.tts
                            ],
                      voice:
                        nextProvider === 'fake'
                          ? null
                          : VOICE_HINTS[
                              nextProvider as keyof typeof VOICE_HINTS
                            ],
                    },
                  }))
                }}
                onModelChange={model =>
                  setSettings(current => ({
                    ...current,
                    tts: { ...current.tts, model },
                  }))
                }
                onVoiceChange={voice =>
                  setSettings(current => ({
                    ...current,
                    tts: { ...current.tts, voice },
                  }))
                }
                onTest={() => {
                  void handleTest('tts')
                }}
              />
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="API keys"
            subheader="Keys entered here are saved as write-only overrides."
          />
          <CardContent>
            <Stack spacing={2}>
              {SECRET_FIELDS.map(field => (
                <SecretEditor
                  key={field.key}
                  field={field}
                  status={secrets[field.key]}
                  value={secretInputs[field.key]}
                  disabled={loading || saving || Boolean(clearingSecret)}
                  clearing={clearingSecret === field.key}
                  onChange={value =>
                    setSecretInputs(current => ({
                      ...current,
                      [field.key]: value,
                    }))
                  }
                  onClear={() => {
                    void handleClearSecret(field.key)
                  }}
                />
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Stack direction="row" spacing={2}>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={loading || saving || Boolean(clearingSecret)}
          >
            {saving ? 'Saving...' : 'Save settings'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => void load()}
            disabled={loading || saving || Boolean(clearingSecret)}
          >
            Reload
          </Button>
        </Stack>
          </>
        )}

        {tab === 1 && (
          <SipSettingsEditor
            settings={sipSettings}
            secrets={sipSecrets}
            status={sipStatus}
            passwordValue={sipPasswordInput}
            preferredCodecsText={preferredCodecsText}
            disabled={loading || savingSip || restartingSip}
            saving={savingSip}
            restarting={restartingSip}
            onSettingsChange={setSipSettings}
            onPasswordChange={setSipPasswordInput}
            onPreferredCodecsTextChange={value => {
              setPreferredCodecsText(value)
              setSipSettings(current => ({
                ...current,
                preferredCodecs: parsePreferredCodecs(value),
              }))
            }}
            onSave={() => {
              void handleSaveSip()
            }}
            onRestart={() => {
              void handleRestartSip()
            }}
            onRefreshStatus={() => {
              void handleRefreshSipStatus()
            }}
          />
        )}

        {tab === 2 && <MailboxesTab />}
      </Stack>
    </Container>
  )
}

function SipSettingsEditor(props: {
  settings: SipSettings
  secrets: SipSecretStatusMap
  status: SipRuntimeStatus
  passwordValue: string
  preferredCodecsText: string
  disabled: boolean
  saving: boolean
  restarting: boolean
  onSettingsChange: (update: (current: SipSettings) => SipSettings) => void
  onPasswordChange: (value: string) => void
  onPreferredCodecsTextChange: (value: string) => void
  onSave: () => void
  onRestart: () => void
  onRefreshStatus: () => void
}) {
  const updateSettings = (patch: Partial<SipSettings>) => {
    props.onSettingsChange(current => ({ ...current, ...patch }))
  }
  const passwordSource =
    props.secrets.authPassword.source === 'env'
      ? 'Env'
      : props.secrets.authPassword.source === 'stored'
        ? 'Saved'
        : 'Missing'
  const lastWritten = props.status.accountsLastWrittenAt
    ? new Date(props.status.accountsLastWrittenAt).toLocaleString()
    : 'Not written'

  return (
    <Card>
      <CardHeader
        title="SIP edge"
        subheader="baresip account registration, control status, and generated accounts file."
        action={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              label={props.status.telephonyMode}
              color={props.status.telephonyMode === 'baresip' ? 'info' : 'default'}
              variant="outlined"
            />
            <Chip
              label={
                props.status.controlConnected
                  ? 'Control connected'
                  : 'Control disconnected'
              }
              color={props.status.controlConnected ? 'success' : 'warning'}
              variant="outlined"
            />
          </Stack>
        }
      />
      <CardContent>
        <Stack spacing={2}>
          {props.status.telephonyMode === 'fake' && (
            <Alert severity="warning">
              Fake telephony mode is active; SIP settings are saved for the
              baresip edge but calls still use fake telephony.
            </Alert>
          )}

          {props.status.telephonyMode === 'baresip' &&
            !props.status.controlConnected && (
              <Alert severity="warning">
                ComFlow is not connected to baresip ctrl at{' '}
                {props.status.controlHost}:{props.status.controlPort}.
              </Alert>
            )}

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={props.settings.enabled}
                  onChange={event =>
                    updateSettings({ enabled: event.target.checked })
                  }
                  disabled={props.disabled}
                />
              }
              label="SIP registration enabled"
              sx={{ minWidth: 240 }}
            />
            <TextField
              label="Account label"
              value={props.settings.accountLabel}
              onChange={event =>
                updateSettings({ accountLabel: event.target.value })
              }
              disabled={props.disabled}
              sx={{ minWidth: 220 }}
            />
            <TextField
              label="SIP account URI"
              value={props.settings.accountUri ?? ''}
              onChange={event =>
                updateSettings({ accountUri: event.target.value || null })
              }
              placeholder="sip:1001@pbx.example.com"
              disabled={props.disabled}
              fullWidth
            />
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Auth username"
              value={props.settings.authUsername ?? ''}
              onChange={event =>
                updateSettings({ authUsername: event.target.value || null })
              }
              disabled={props.disabled}
              fullWidth
            />
            <TextField
              label="Auth password"
              type="password"
              autoComplete="off"
              value={props.passwordValue}
              onChange={event => props.onPasswordChange(event.target.value)}
              placeholder="Leave blank to keep current password"
              disabled={props.disabled}
              fullWidth
            />
            <Chip
              label={passwordSource}
              color={props.secrets.authPassword.configured ? 'success' : 'warning'}
              variant="outlined"
              sx={{ alignSelf: { xs: 'flex-start', md: 'center' }, minWidth: 96 }}
            />
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Outbound proxy"
              value={props.settings.outboundProxy ?? ''}
              onChange={event =>
                updateSettings({ outboundProxy: event.target.value || null })
              }
              placeholder="sip:sbc.example.com"
              disabled={props.disabled}
              fullWidth
            />
            <TextField
              label="Outbound dialing domain"
              value={props.settings.outboundDialingDomain ?? ''}
              onChange={event =>
                updateSettings({
                  outboundDialingDomain: event.target.value || null,
                })
              }
              placeholder="pbx.example.com"
              disabled={props.disabled}
              fullWidth
            />
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Registration interval"
              type="number"
              value={props.settings.registrationInterval}
              onChange={event =>
                updateSettings({
                  registrationInterval: Number(event.target.value || 600),
                })
              }
              inputProps={{ min: 60, max: 86400 }}
              disabled={props.disabled}
              sx={{ minWidth: 220 }}
            />
            <TextField
              label="Preferred codecs"
              value={props.preferredCodecsText}
              onChange={event =>
                props.onPreferredCodecsTextChange(event.target.value)
              }
              placeholder="PCMU/8000/1, PCMA/8000/1, opus/48000/2"
              disabled={props.disabled}
              fullWidth
            />
          </Stack>

          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Accounts file: {props.status.accountsPath || 'Not configured'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Last written: {lastWritten}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Restart: {props.status.restartSupported ? 'Supervisor' : 'Manual'}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={props.onSave}
              disabled={props.disabled}
            >
              {props.saving ? 'Saving...' : 'Save SIP'}
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={props.onRestart}
              disabled={props.disabled}
            >
              {props.restarting ? 'Restarting...' : 'Restart/reload edge'}
            </Button>
            <Button
              variant="outlined"
              onClick={props.onRefreshStatus}
              disabled={props.disabled}
            >
              Test control
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

function SecretEditor(props: {
  field: (typeof SECRET_FIELDS)[number]
  status: EngineSecretStatus
  value: string
  disabled: boolean
  clearing: boolean
  onChange: (value: string) => void
  onClear: () => void
}) {
  const sourceLabel =
    props.status.source === 'env'
      ? 'Env'
      : props.status.source === 'stored'
        ? 'Saved'
        : 'Missing'
  const sourceColor = props.status.configured ? 'success' : 'warning'

  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={2}
      alignItems={{ md: 'center' }}
    >
      <TextField
        label={props.field.label}
        type="password"
        autoComplete="off"
        value={props.value}
        onChange={event => props.onChange(event.target.value)}
        placeholder={props.field.envName}
        helperText="Leave blank to keep current value."
        disabled={props.disabled}
        fullWidth
      />
      <Chip
        label={sourceLabel}
        color={sourceColor}
        variant="outlined"
        sx={{ minWidth: 96 }}
      />
      {props.status.source === 'stored' && (
        <Button
          variant="outlined"
          color="warning"
          startIcon={<DeleteIcon />}
          onClick={props.onClear}
          disabled={props.disabled}
          sx={{ minWidth: 180 }}
        >
          {props.clearing ? 'Clearing...' : 'Clear saved'}
        </Button>
      )}
    </Stack>
  )
}

function EngineEditor(props: {
  engine: 'llm' | 'stt' | 'tts'
  title: string
  provider: string
  model: string | null
  voice: string | null
  readiness: EngineReadinessMap['llm'] | EngineReadinessMap['stt'] | EngineReadinessMap['tts']
  testMessage?: string
  testing: boolean
  disabled: boolean
  onProviderChange: (provider: string) => void
  onModelChange: (model: string | null) => void
  onVoiceChange: (voice: string | null) => void
  onTest: () => void
}) {
  const providerOptions =
    props.engine === 'llm'
      ? PROVIDER_OPTIONS.llm
      : props.engine === 'stt'
        ? PROVIDER_OPTIONS.stt
        : PROVIDER_OPTIONS.tts

  const isFake = props.provider === 'fake'

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ md: 'center' }}
      >
        <Typography variant="h5">{props.title}</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            label={props.readiness.ready ? 'Ready' : 'Missing secret'}
            color={props.readiness.ready ? 'success' : 'warning'}
            variant="outlined"
          />
          <Button variant="outlined" onClick={props.onTest} disabled={props.disabled || props.testing}>
            {props.testing ? 'Testing...' : 'Test'}
          </Button>
        </Stack>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField
          select
          label="Provider"
          value={props.provider}
          onChange={event => props.onProviderChange(event.target.value)}
          sx={{ minWidth: 220 }}
          disabled={props.disabled}
        >
          {providerOptions.map(option => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="Model"
          value={props.model ?? ''}
          onChange={event =>
            props.onModelChange(event.target.value.trim() || null)
          }
          disabled={props.disabled || isFake}
          fullWidth
        />

        {props.engine === 'tts' && (
          <TextField
            label="Voice"
            value={props.voice ?? ''}
            onChange={event =>
              props.onVoiceChange(event.target.value.trim() || null)
            }
            disabled={props.disabled || isFake}
            fullWidth
          />
        )}
      </Stack>

      {!props.readiness.ready && props.readiness.missingSecrets.length > 0 && (
        <Alert severity="warning">
          Missing env vars: {props.readiness.missingSecrets.join(', ')}
        </Alert>
      )}

      {props.testMessage && (
        <Alert severity={props.testMessage.toLowerCase().includes('failed') ? 'error' : 'info'}>
          {props.testMessage}
        </Alert>
      )}
    </Stack>
  )
}
