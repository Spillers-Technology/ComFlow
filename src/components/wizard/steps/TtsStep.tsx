import { useState } from 'react'
import {
  Card,
  CardHeader,
  CardContent,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Typography,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ReplayIcon from '@mui/icons-material/Replay'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { WizardState } from '../../../types'

interface TtsStepProps {
  wizardState: WizardState
  updateStep: (updates: Partial<WizardState['tts']>) => void
}

export function TtsStep({ wizardState, updateStep }: TtsStepProps) {
  const [provider, setProvider] = useState('demo')
  const [voice, setVoice] = useState('Calm Assistant')
  const [playing, setPlaying] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const playSample = () => {
    setMsg(null)
    setPlaying(true)
    setTimeout(() => {
      setPlaying(false)
      updateStep({ done: true, error: undefined })
      setMsg(
        'Demo: Imagine “Hello, this is your Comflow assistant.” in this voice. Real TTS preview attaches here.'
      )
    }, 900)
  }

  return (
    <Card>
      <CardHeader
        title="Choose your assistant’s voice"
        subheader="Friendly, clear, and calm by default."
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
            disabled={playing}
            onClick={playSample}
          >
            {playing ? 'Playing sample…' : 'Play Sample Voice'}
          </Button>

          {msg && (
            <Stack direction="row" spacing={1} alignItems="center">
              <VolumeUpIcon fontSize="small" color="success" />
              <Typography variant="body2">{msg}</Typography>
            </Stack>
          )}

          {wizardState.tts.error && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ color: 'error.main' }}
            >
              <ErrorOutlineIcon fontSize="small" />
              <Typography variant="body2">{wizardState.tts.error}</Typography>
            </Stack>
          )}

          <Typography variant="caption" color="text.secondary">
            Real: map per-number / per-tenant voices without cluttering onboarding.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  )
}
