import { useState, useEffect } from 'react'
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Container,
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  TextField,
  Button,
  Stack,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Chip,
  Divider,
  LinearProgress,
  Tooltip,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import SettingsIcon from '@mui/icons-material/Settings'
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk'
import VoicemailIcon from '@mui/icons-material/Voicemail'
import CloudDoneIcon from '@mui/icons-material/CloudDone'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ReplayIcon from '@mui/icons-material/Replay'
import MicIcon from '@mui/icons-material/Mic'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import DashboardIcon from '@mui/icons-material/Dashboard'

// ----- Types -----

type View =
  | 'auth'
  | 'wizard'
  | 'setup-complete'
  | 'dashboard'
  | 'voicemail-detail'
  | 'settings'

type WizardStepKey = 'sip' | 'llm' | 'tts' | 'callTest'

interface WizardStepState {
  done: boolean
  error?: string
}

interface WizardState {
  sip: WizardStepState
  llm: WizardStepState
  tts: WizardStepState
  callTest: WizardStepState
}

interface Voicemail {
  id: string
  from: string
  number: string
  time: string
  summary: string
  confidence: 'high' | 'med' | 'low'
  transcript: { t: string; text: string; conf: 'high' | 'med' | 'low' }[]
}

// ----- Theme -----

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#4F8BFF',
    },
    background: {
      default: '#050814',
      paper: '#0C1020',
    },
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  },
})

// ----- Mock Data -----

const mockVoicemails: Voicemail[] = [
  {
    id: '1',
    from: 'Acme Corp',
    number: '+1 (555) 012-3000',
    time: '2 min ago',
    summary: 'Asking about rescheduling a demo tomorrow.',
    confidence: 'high',
    transcript: [
      { t: '00:00', text: 'Hi, this is Sarah from Acme Corp.', conf: 'high' },
      { t: '00:04', text: 'We’d like to confirm or reschedule tomorrow’s call.', conf: 'high' },
      { t: '00:10', text: 'Please call me back when convenient.', conf: 'med' },
    ],
  },
  {
    id: '2',
    from: 'Unknown',
    number: '+1 (555) 889-1122',
    time: '18 min ago',
    summary: 'Missed call, partial voicemail about invoice.',
    confidence: 'med',
    transcript: [
      { t: '00:00', text: 'Hey, just checking on that invoice...', conf: 'med' },
    ],
  },
  {
    id: '3',
    from: 'Mom',
    number: '+1 (555) 222-7788',
    time: '1 hr ago',
    summary: 'Friendly check-in.',
    confidence: 'high',
    transcript: [
      { t: '00:00', text: 'Hi honey, just wanted to hear your voice.', conf: 'high' },
    ],
  },
  {
    id: '4',
    from: 'Spam Likely',
    number: '+1 (555) 999-0000',
    time: '2 hr ago',
    summary: 'Likely robocall detected.',
    confidence: 'low',
    transcript: [
      { t: '00:00', text: 'Congratulations you have been selected...', conf: 'low' },
    ],
  },
  {
    id: '5',
    from: 'Client Support Line',
    number: '+1 (555) 400-2121',
    time: 'Yesterday',
    summary: 'User requesting password reset assistance.',
    confidence: 'high',
    transcript: [
      { t: '00:00', text: 'We’re locked out of the portal, can you help?', conf: 'high' },
    ],
  },
]

// ----- Helpers -----

function confidenceColor(level: Voicemail['confidence']) {
  if (level === 'high') return 'success'
  if (level === 'med') return 'warning'
  return 'error'
}

function stepLabel(key: WizardStepKey): string {
  switch (key) {
    case 'sip':
      return 'Connect Phone Line'
    case 'llm':
      return 'Set Up AI Brain'
    case 'tts':
      return 'Choose Voice'
    case 'callTest':
      return 'Test Call Experience'
  }
}

// ----- Components -----

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email || !password) {
      setError('Enter email and password to continue.')
      return
    }
    setLoading(true)
    // Pure front-end “sign in”
    setTimeout(() => {
      setLoading(false)
      onAuthenticated()
    }, 700)
  }

  return (
    <Container maxWidth="sm" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Card sx={{ width: '100%', p: 3 }}>
        <CardHeader
          title="Welcome to Comflow"
          subheader="AI voicemail & call automation without the panic."
        />
        <CardContent>
          <Stack spacing={2} component="form" onSubmit={handleSubmit}>
            <TextField
              label="Email"
              type="email"
              fullWidth
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <TextField
              label="Password"
              type="password"
              fullWidth
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            {error && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'error.main' }}>
                <ErrorOutlineIcon fontSize="small" />
                <Typography variant="body2">{error}</Typography>
              </Stack>
            )}
            {loading && <LinearProgress />}
            <Button
              variant="contained"
              type="submit"
              size="large"
              endIcon={<ArrowForwardIcon />}
              disabled={loading}
            >
              Begin Setup
            </Button>
            <Typography variant="caption" color="text.secondary">
              No jargon. We’ll walk you through your phone system in ~2–3 minutes.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  )
}

// Wizard wrapper
function SetupWizard({
  state,
  setState,
  onComplete,
}: {
  state: WizardState
  setState: (updater: (prev: WizardState) => WizardState) => void
  onComplete: () => void
}) {
  const [activeStep, setActiveStep] = useState<WizardStepKey>('sip')

  useEffect(() => {
    // Auto-advance to first incomplete step
    const order: WizardStepKey[] = ['sip', 'llm', 'tts', 'callTest']
    const firstIncomplete = order.find(k => !state[k].done)
    if (firstIncomplete && firstIncomplete !== activeStep) {
      setActiveStep(firstIncomplete)
    }
    if (order.every(k => state[k].done)) {
      onComplete()
    }
  }, [state, activeStep, onComplete])

  const canAccess = (key: WizardStepKey): boolean => {
    const order: WizardStepKey[] = ['sip', 'llm', 'tts', 'callTest']
    const index = order.indexOf(key)
    if (index === -1) return false
    if (index === 0) return true
    const prevKey = order[index - 1]
    return state[prevKey].done
  }

  return (
    <Container maxWidth="lg" sx={{ py: 5 }}>
      <Stack direction="row" spacing={4} alignItems="flex-start">
        {/* Left: Checklist hero */}
        <Box sx={{ width: 320 }}>
          <Typography variant="h4" gutterBottom>
            Let&apos;s set up your phone system.
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Follow the steps in order. We&apos;ll confirm each one.
          </Typography>
          <Card sx={{ mt: 2 }}>
            <CardHeader title="Setup Checklist" />
            <CardContent>
              <List dense>
                {(['sip', 'llm', 'tts', 'callTest'] as WizardStepKey[]).map(key => {
                  const step = state[key]
                  const locked = !canAccess(key)
                  return (
                    <ListItem
                      key={key}
                      button
                      onClick={() => !locked && setActiveStep(key)}
                      disabled={locked}
                      sx={{
                        borderRadius: 2,
                        mb: 0.5,
                        bgcolor:
                          activeStep === key && !locked
                            ? 'primary.main'
                            : 'transparent',
                      }}
                    >
                      <ListItemIcon>
                        {step.done ? (
                          <CheckCircleIcon color="success" />
                        ) : locked ? (
                          <RadioButtonUncheckedIcon color="disabled" />
                        ) : (
                          <RadioButtonUncheckedIcon color="primary" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={stepLabel(key)}
                        secondary={
                          locked
                            ? 'Complete previous step first.'
                            : step.done
                            ? 'Completed'
                            : 'Required'
                        }
                      />
                    </ListItem>
                  )
                })}
              </List>
            </CardContent>
          </Card>
          <Stack direction="row" spacing={1} mt={2} alignItems="center">
            <SettingsIcon fontSize="small" color="disabled" />
            <Typography variant="caption" color="text.secondary">
              Advanced options unlock after initial setup. No surprise complexity.
            </Typography>
          </Stack>
        </Box>

        {/* Right: Active step panel */}
        <Box sx={{ flex: 1 }}>
          <StepPanel
            step={activeStep}
            state={state}
            setState={setState}
            canAccess={canAccess}
          />
        </Box>
      </Stack>
    </Container>
  )
}

// Individual step content
function StepPanel({
  step,
  state,
  setState,
  canAccess,
}: {
  step: WizardStepKey
  state: WizardState
  setState: (updater: (prev: WizardState) => WizardState) => void
  canAccess: (key: WizardStepKey) => boolean
}) {
  if (!canAccess(step)) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6">Locked</Typography>
          <Typography variant="body2" color="text.secondary">
            Finish the previous step to continue.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  switch (step) {
    case 'sip':
      return <SipStep state={state} setState={setState} />
    case 'llm':
      return <LlmStep state={state} setState={setState} />
    case 'tts':
      return <TtsStep state={state} setState={setState} />
    case 'callTest':
      return <CallTestStep state={state} setState={setState} />
  }
}

// Step 1: SIP
function SipStep({
  state,
  setState,
}: {
  state: WizardState
  setState: (updater: (prev: WizardState) => WizardState) => void
}) {
  const [form, setForm] = useState({
    server: '',
    username: '',
    password: '',
    did: '',
  })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const onTest = () => {
    setMsg(null)
    if (!form.server || !form.username || !form.password || !form.did) {
      setMsg('Fill in all fields to test your line.')
      return
    }
    setLoading(true)

    // Simulated "no backend yet" but UX still works.
    setTimeout(() => {
      setLoading(false)
      const nextState: WizardStepState = {
        done: true,
        error: undefined,
      }
      setState(prev => ({ ...prev, sip: nextState }))
      setMsg(
        'Demo: Details saved. When backend is connected, this button will live-check registration and show exact status.'
      )
    }, 900)
  }

  return (
    <Card>
      <CardHeader
        title="Connect your phone line"
        subheader="This tells Comflow which number to listen on."
      />
      <CardContent>
        <Stack spacing={2}>
          <TextField
            label="SIP Server"
            placeholder="sip.provider.com"
            value={form.server}
            onChange={e => setForm({ ...form, server: e.target.value })}
            fullWidth
          />
          <TextField
            label="Username"
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            fullWidth
          />
          <TextField
            label="Password"
            type="password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            fullWidth
          />
          <TextField
            label="Your Phone Number / DID"
            placeholder="+1 555 123 4567"
            value={form.did}
            onChange={e => setForm({ ...form, did: e.target.value })}
            fullWidth
          />

          {loading && <LinearProgress />}

          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              variant="contained"
              onClick={onTest}
              disabled={loading}
              endIcon={<PhoneInTalkIcon />}
            >
              Test SIP Connectivity
            </Button>
            <Tooltip title="Guide opens provider-specific help when wired in.">
              <Button
                variant="text"
                size="small"
                disabled
              >
                How to find these in Twilio / Callcentric
              </Button>
            </Tooltip>
          </Stack>

          <Typography variant="caption" color="text.secondary">
            For now, this demo only stores these values in memory. No live calls yet, no risk.
          </Typography>

          {msg && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CheckCircleIcon fontSize="small" color="success" />
              <Typography variant="body2">{msg}</Typography>
            </Stack>
          )}

          {state.sip.error && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'error.main' }}>
              <ErrorOutlineIcon fontSize="small" />
              <Typography variant="body2">{state.sip.error}</Typography>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

// Step 2: LLM
function LlmStep({
  state,
  setState,
}: {
  state: WizardState
  setState: (updater: (prev: WizardState) => WizardState) => void
}) {
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4.1-mini')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const onTest = () => {
    setMsg(null)
    if (!apiKey) {
      setMsg('Paste an API key (fake is fine here).')
      return
    }
    setLoading(true)

    setTimeout(() => {
      setLoading(false)
      // No real call; simulate "backend missing" but pass UX.
      setMsg(
        `Demo: We pretended to send “Say hello, Comflow.” to ${provider} (${model}). Real connectivity checks plug in here.`
      )
      setState(prev => ({ ...prev, llm: { done: true } }))
    }, 900)
  }

  return (
    <Card>
      <CardHeader
        title="Set up your AI brain"
        subheader="This is what understands your callers and writes responses."
      />
      <CardContent>
        <Stack spacing={2}>
          <FormControl fullWidth>
            <InputLabel>Provider</InputLabel>
            <Select
              label="Provider"
              value={provider}
              onChange={e => setProvider(e.target.value)}
            >
              <MenuItem value="openai">OpenAI-compatible</MenuItem>
              <MenuItem value="ollama">Local (Ollama)</MenuItem>
              <MenuItem value="lmstudio">Local (LM Studio)</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="API Key / Endpoint Token"
            type="password"
            fullWidth
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
          <TextField
            label="Model Name"
            fullWidth
            value={model}
            onChange={e => setModel(e.target.value)}
            helperText="Example: gpt-4.1-mini, llama3.1:8b, etc."
          />

          {loading && <LinearProgress />}

          <Button
            variant="contained"
            onClick={onTest}
            disabled={loading}
            endIcon={<CloudDoneIcon />}
          >
            Send Test Prompt
          </Button>

          {msg && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CheckCircleIcon fontSize="small" color="success" />
              <Typography variant="body2">{msg}</Typography>
            </Stack>
          )}

          {state.llm.error && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'error.main' }}>
              <ErrorOutlineIcon fontSize="small" />
              <Typography variant="body2">{state.llm.error}</Typography>
            </Stack>
          )}

          <Typography variant="caption" color="text.secondary">
            Real implementation:
            validate key, ping /v1/models, show latency + model info.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  )
}

// Step 3: TTS
function TtsStep({
  state,
  setState,
}: {
  state: WizardState
  setState: (updater: (prev: WizardState) => WizardState) => void
}) {
  const [provider, setProvider] = useState('demo')
  const [voice, setVoice] = useState('Calm Assistant')
  const [playing, setPlaying] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const playSample = () => {
    setMsg(null)
    setPlaying(true)
    setTimeout(() => {
      setPlaying(false)
      setMsg(
        'Demo: Imagine hearing “Hello, this is your Comflow assistant.” in this voice. Real TTS preview wires in here.'
      )
      setState(prev => ({ ...prev, tts: { done: true } }))
    }, 1000)
  }

  return (
    <Card>
      <CardHeader
        title="Choose your assistant’s voice"
        subheader="Friendly, clear, and professional by default."
      />
      <CardContent>
        <Stack spacing={2}>
          <FormControl fullWidth>
            <InputLabel>Provider</InputLabel>
            <Select
              label="Provider"
              value={provider}
              onChange={e => setProvider(e.target.value)}
            >
              <MenuItem value="demo">Built-in Demo</MenuItem>
              <MenuItem value="elevenlabs" disabled>
                ElevenLabs (soon)
              </MenuItem>
              <MenuItem value="azure" disabled>
                Azure Neural Voices (soon)
              </MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Voice</InputLabel>
            <Select
              label="Voice"
              value={voice}
              onChange={e => setVoice(e.target.value)}
            >
              <MenuItem value="Calm Assistant">Calm Assistant</MenuItem>
              <MenuItem value="Warm Concierge">Warm Concierge</MenuItem>
              <MenuItem value="Direct Support Rep">Direct Support Rep</MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="contained"
            startIcon={playing ? <ReplayIcon /> : <PlayArrowIcon />}
            onClick={playSample}
            disabled={playing}
          >
            {playing ? 'Playing sample…' : 'Play Sample Voice'}
          </Button>

          {msg && (
            <Stack direction="row" spacing={1} alignItems="center">
              <VolumeUpIcon fontSize="small" color="success" />
              <Typography variant="body2">{msg}</Typography>
            </Stack>
          )}

          {state.tts.error && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'error.main' }}>
              <ErrorOutlineIcon fontSize="small" />
              <Typography variant="body2">{state.tts.error}</Typography>
            </Stack>
          )}

          <Typography variant="caption" color="text.secondary">
            Later: real TTS preview, per-number voices, branded greetings.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  )
}

// Step 4: Call Test
function CallTestStep({
  state,
  setState,
}: {
  state: WizardState
  setState: (updater: (prev: WizardState) => WizardState) => void
}) {
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'ring' | 'greet' | 'caller' | 'response' | 'done'>(
    'idle'
  )
  const [transcriptShown, setTranscriptShown] = useState(false)

  const startSim = () => {
    if (running) return
    setTranscriptShown(false)
    setRunning(true)
    setPhase('ring')

    // Simple staged simulation
    setTimeout(() => setPhase('greet'), 800)
    setTimeout(() => setPhase('caller'), 1600)
    setTimeout(() => setPhase('response'), 2600)
    setTimeout(() => {
      setPhase('done')
      setRunning(false)
      setTranscriptShown(true)
      setState(prev => ({ ...prev, callTest: { done: true } }))
    }, 3800)
  }

  return (
    <Card>
      <CardHeader
        title="Simulate an incoming call"
        subheader="Watch how Comflow answers, listens, and logs — in one calm view."
      />
      <CardContent>
        <Stack spacing={2}>
          <Button
            variant="contained"
            onClick={startSim}
            startIcon={<PhoneInTalkIcon />}
            disabled={running}
          >
            {running ? 'Running simulation…' : 'Simulate Incoming Call'}
          </Button>

          <Box
            sx={{
              mt: 1,
              p: 2,
              borderRadius: 2,
              border: '1px solid rgba(255,255,255,0.1)',
              minHeight: 120,
            }}
          >
            {phase === 'idle' && (
              <Typography variant="body2" color="text.secondary">
                Click “Simulate Incoming Call” to see the full path without touching a real number.
              </Typography>
            )}
            {phase === 'ring' && (
              <Typography variant="body1">📞 Ringing…</Typography>
            )}
            {phase === 'greet' && (
              <Typography variant="body1">
                🤖 “Hello, you’ve reached your Comflow assistant. How can we help today?”
              </Typography>
            )}
            {phase === 'caller' && (
              <Typography variant="body1">
                🗣️ Caller: “Hi, I&apos;d like to schedule a callback about pricing.”
              </Typography>
            )}
            {phase === 'response' && (
              <Typography variant="body1">
                🤖 “Got it. I&apos;ll save your message and we&apos;ll get back to you shortly.”
              </Typography>
            )}
            {phase === 'done' && (
              <Typography variant="body1" color="success.main">
                ✅ Demo call complete. STT, AI, TTS, and logging views sit behind this moment
                in the real system.
              </Typography>
            )}
          </Box>

          {transcriptShown && (
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <Typography variant="subtitle2" gutterBottom>
                Example Transcript
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                [00:00] Caller: “Hi, I’d like to schedule a callback about pricing.”
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                [00:04] Assistant (AI): Summarized: Caller wants a pricing callback. Tag:
                &nbsp;
                <Chip label="Sales" size="small" color="primary" />
              </Typography>
              <Typography variant="caption" color="text.secondary">
                No real audio or external calls yet. All client-side. When APIs exist, this same
                layout renders live data.
              </Typography>
            </Box>
          )}

          {state.callTest.error && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'error.main' }}>
              <ErrorOutlineIcon fontSize="small" />
              <Typography variant="body2">{state.callTest.error}</Typography>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

// Setup Complete
function SetupCompleteScreen({
  onGoDashboard,
}: {
  onGoDashboard: () => void
}) {
  return (
    <Container maxWidth="md" sx={{ py: 8 }}>
      <Card sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          Setup complete 🎉
        </Typography>
        <Typography variant="body1" color="text.secondary" gutterBottom>
          Your first Comflow line is ready on paper. Next, you&apos;ll see how calls, messages,
          and system health show up.
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mt={3}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                📞 Active Voicemail Line
              </Typography>
              <Typography variant="h6">Configured number (demo)</Typography>
              <Typography variant="caption" color="text.secondary">
                When SIP is wired in, your real DID appears here.
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                🗄️ Log Destination
              </Typography>
              <Typography variant="h6">Local Comflow Storage</Typography>
              <Typography variant="caption" color="text.secondary">
                Real app: choose S3, database, or encrypted volume.
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                🔌 Integrations
              </Typography>
              <Typography variant="h6">AI & Voice linked (demo)</Typography>
              <Typography variant="caption" color="text.secondary">
                Actual providers + models surface here later.
              </Typography>
            </CardContent>
          </Card>
        </Stack>
        <Button
          variant="contained"
          size="large"
          sx={{ mt: 4 }}
          onClick={onGoDashboard}
          startIcon={<DashboardIcon />}
        >
          Go to Dashboard
        </Button>
      </Card>
    </Container>
  )
}

// Dashboard
function Dashboard({
  onOpenSettings,
  onOpenVoicemail,
}: {
  onOpenSettings: () => void
  onOpenVoicemail: (vm: Voicemail) => void
}) {
  const vms = mockVoicemails.slice(0, 5)

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
        spacing={2}
      >
        <Box>
          <Typography variant="h4">Comflow</Typography>
          <Typography variant="body2" color="text.secondary">
            Calm overview. Calls in, AI working, storage safe.
          </Typography>
        </Box>
        <IconButton onClick={onOpenSettings}>
          <SettingsIcon />
        </IconButton>
      </Stack>

      <Stack spacing={3}>
        {/* Recent Voicemails */}
        <Card>
          <CardHeader
            avatar={<VoicemailIcon />}
            title="Recent voicemails"
            subheader="Latest 5 messages."
          />
          <CardContent>
            {vms.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No voicemails yet. Once calls flow, they show up here.
              </Typography>
            )}
            {vms.map(vm => (
              <Box
                key={vm.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  py: 1,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
                }}
                onClick={() => onOpenVoicemail(vm)}
              >
                <Box>
                  <Typography variant="subtitle2">
                    {vm.from} <Typography variant="caption">({vm.number})</Typography>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {vm.summary.slice(0, 40)}
                    {vm.summary.length > 40 ? '…' : ''}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Chip
                    size="small"
                    label={vm.confidence === 'high'
                      ? 'High confidence'
                      : vm.confidence === 'med'
                      ? 'Medium'
                      : 'Low'}
                    color={confidenceColor(vm.confidence) as any}
                    variant="outlined"
                  />
                  <Typography variant="caption" color="text.secondary">
                    {vm.time}
                  </Typography>
                </Stack>
              </Box>
            ))}
          </CardContent>
        </Card>

        {/* System Health + Storage */}
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
          <Card sx={{ flex: 1 }}>
            <CardHeader title="System health" />
            <CardContent>
              <Stack spacing={1.5}>
                <HealthRow label="SIP Registration" status="green" note="Configured (demo)" />
                <HealthRow label="AI Brain" status="green" note="Responding in demo mode" />
                <HealthRow label="Voice Engine" status="green" note="Sample playback available" />
              </Stack>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1 }}>
            <CardHeader title="Storage capacity" />
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Using 100 MB of 5 GB demo quota.
              </Typography>
              <LinearProgress
                variant="determinate"
                value={(100 / 5000) * 100}
                sx={{ mt: 1.5 }}
              />
              <Typography variant="caption" color="text.secondary">
                Real app: configurable limits & retention.
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      </Stack>
    </Container>
  )
}

function HealthRow({
  label,
  status,
  note,
}: {
  label: string
  status: 'green' | 'amber' | 'red'
  note: string
}) {
  const color =
    status === 'green'
      ? 'success.main'
      : status === 'amber'
      ? 'warning.main'
      : 'error.main'

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          bgcolor: color,
        }}
      />
      <Typography variant="body2">{label}</Typography>
      <Typography variant="caption" color="text.secondary">
        {note}
      </Typography>
    </Stack>
  )
}

// Voicemail Detail
function VoicemailDetail({
  voicemail,
  onBack,
}: {
  voicemail: Voicemail
  onBack: () => void
}) {
  const [resolution, setResolution] = useState('callback')
  const [note, setNote] = useState('')

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Button variant="text" onClick={onBack} sx={{ mb: 2 }}>
        ← Back to Dashboard
      </Button>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
        <Card sx={{ flex: 2 }}>
          <CardHeader
            title={`Voicemail from ${voicemail.from}`}
            subheader={`${voicemail.number} • ${voicemail.time}`}
          />
          <CardContent>
            <Stack spacing={1.5}>
              {voicemail.transcript.map((line, i) => (
                <Box key={i}>
                  <Typography variant="caption" color="text.secondary">
                    [{line.t}] • {line.conf === 'high'
                      ? 'High'
                      : line.conf === 'med'
                      ? 'Med'
                      : 'Low'}{' '}
                    confidence
                  </Typography>
                  <Typography variant="body2">{line.text}</Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1 }}>
          <CardHeader title="Actions & details" />
          <CardContent>
            <Stack spacing={2}>
              <Button
                variant="outlined"
                startIcon={<PlayArrowIcon />}
                disabled
              >
                Play recording (coming soon)
              </Button>
              <Button
                variant="outlined"
                startIcon={<DownloadIconStub />}
                disabled
              >
                Download audio (coming soon)
              </Button>

              <Divider />

              <Typography variant="subtitle2">Tag</Typography>
              <Stack direction="row" spacing={1}>
                <Chip label="Billing" size="small" variant="outlined" />
                <Chip label="Support" size="small" variant="outlined" />
                <Chip label="Sales" size="small" variant="outlined" />
              </Stack>

              <TextField
                label="Internal notes"
                multiline
                minRows={3}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Called back, left follow-up."
              />

              <FormControl fullWidth>
                <InputLabel>Resolution</InputLabel>
                <Select
                  label="Resolution"
                  value={resolution}
                  onChange={e => setResolution(e.target.value)}
                >
                  <MenuItem value="callback">Call back</MenuItem>
                  <MenuItem value="archived">Archive</MenuItem>
                  <MenuItem value="escalate">Escalate</MenuItem>
                </Select>
              </FormControl>

              <Typography variant="caption" color="text.secondary">
                All actions are local-only in this demo. Real wiring: update ticketing, CRM, or
                your own API.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  )
}

function DownloadIconStub() {
  // Tiny inline icon without extra import noise
  return (
    <Box
      component="span"
      sx={{
        width: 16,
        height: 16,
        borderBottom: '2px solid currentColor',
        borderLeft: '2px solid transparent',
        borderRight: '2px solid transparent',
        position: 'relative',
      }}
    />
  )
}

// Settings
function SettingsView({
  onBack,
}: {
  onBack: () => void
}) {
  const [tab, setTab] = useState(0)
  const [advanced, setAdvanced] = useState(false)

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Button variant="text" onClick={onBack} sx={{ mb: 2 }}>
        ← Back to Dashboard
      </Button>
      <Card>
        <CardHeader
          title="Settings"
          subheader="Only the essentials. Advanced stays hidden until you want it."
        />
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={3}
            alignItems={{ md: 'center' }}
            mb={2}
          >
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              variant="scrollable"
              scrollButtons="auto"
            >
              <Tab label="Phone System" />
              <Tab label="AI Engine" />
              <Tab label="Storage & Retention" />
              <Tab label="Integrations" disabled={!advanced} />
            </Tabs>
            <FormControlLabel
              control={
                <Switch
                  checked={advanced}
                  onChange={e => setAdvanced(e.target.checked)}
                />
              }
              label="Advanced Mode"
            />
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {tab === 0 && (
            <Typography variant="body2">
              Configure numbers, routing, and caller experience in one place.
              In this demo, values are static; wiring to SIP + routing APIs
              comes later without changing layout.
            </Typography>
          )}
          {tab === 1 && (
            <Typography variant="body2">
              Choose models, safety levels, and personalities.
              Initial releases keep this minimal: one model, safe defaults.
            </Typography>
          )}
          {tab === 2 && (
            <Typography variant="body2">
              Set how long to keep voicemails and transcripts.
              Default: 30 days. Future: per-tenant policies & cost controls.
            </Typography>
          )}
          {tab === 3 && advanced && (
            <Typography variant="body2">
              Advanced: memory embeddings, multi-agent flows, and automations.
              Hidden from normal users; unlocked intentionally.
            </Typography>
          )}
        </CardContent>
      </Card>
    </Container>
  )
}

// ----- Root App -----

function App() {
  const [view, setView] = useState<View>('auth')
  const [wizardState, setWizardState] = useState<WizardState>({
    sip: { done: false },
    llm: { done: false },
    tts: { done: false },
    callTest: { done: false },
  })
  const [selectedVoicemail, setSelectedVoicemail] = useState<Voicemail | null>(null)

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {view === 'auth' && (
        <AuthScreen onAuthenticated={() => setView('wizard')} />
      )}

      {view === 'wizard' && (
        <SetupWizard
          state={wizardState}
          setState={up => setWizardState(prev => up(prev))}
          onComplete={() => setView('setup-complete')}
        />
      )}

      {view === 'setup-complete' && (
        <SetupCompleteScreen onGoDashboard={() => setView('dashboard')} />
      )}

      {view === 'dashboard' && !selectedVoicemail && (
        <Dashboard
          onOpenSettings={() => setView('settings')}
          onOpenVoicemail={vm => {
            setSelectedVoicemail(vm)
            setView('voicemail-detail')
          }}
        />
      )}

      {view === 'voicemail-detail' && selectedVoicemail && (
        <VoicemailDetail
          voicemail={selectedVoicemail}
          onBack={() => {
            setSelectedVoicemail(null)
            setView('dashboard')
          }}
        />
      )}

      {view === 'settings' && (
        <SettingsView onBack={() => setView('dashboard')} />
      )}
    </ThemeProvider>
  )
}

export default App
