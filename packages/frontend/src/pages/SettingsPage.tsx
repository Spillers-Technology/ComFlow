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
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import {
  EngineKind,
  EngineReadinessMap,
  EngineSettings,
} from '../../../shared/src/index.js'
import {
  getEngineSettings,
  testEngine,
  updateEngineSettings,
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

export function SettingsPage() {
  const [settings, setSettings] = useState<EngineSettings>(EMPTY_SETTINGS)
  const [readiness, setReadiness] = useState<EngineReadinessMap>(EMPTY_READINESS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
      const result = await getEngineSettings()
      setSettings(result.settings)
      setReadiness(result.readiness)
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
      const result = await updateEngineSettings(settings)
      setSettings(result.settings)
      setReadiness(result.readiness)
      setNotice('Engine settings saved.')
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setSaving(false)
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
          <Typography variant="h3">Engine settings</Typography>
          <Typography color="text.secondary">
            Provider choice is persisted in SQLite. API keys stay in env vars
            and surface here only as readiness.
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}

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

        <Stack direction="row" spacing={2}>
          <Button variant="contained" onClick={handleSave} disabled={loading || saving}>
            {saving ? 'Saving...' : 'Save settings'}
          </Button>
          <Button variant="outlined" onClick={() => void load()} disabled={loading || saving}>
            Reload
          </Button>
        </Stack>
      </Stack>
    </Container>
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
