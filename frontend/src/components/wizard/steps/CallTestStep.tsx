import { useState } from 'react'
import {
  Card,
  CardHeader,
  CardContent,
  Stack,
  Button,
  Box,
  Typography,
  Chip,
} from '@mui/material'
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { WizardState } from '../../../types'

type Phase = 'idle' | 'ring' | 'greet' | 'caller' | 'response' | 'done'

interface CallTestStepProps {
  wizardState: WizardState
  updateStep: (updates: Partial<WizardState['callTest']>) => void
}

export function CallTestStep({ wizardState, updateStep }: CallTestStepProps) {
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [showTranscript, setShowTranscript] = useState(false)

  const startSim = () => {
    if (running) return
    setRunning(true)
    setShowTranscript(false)
    setPhase('ring')

    setTimeout(() => setPhase('greet'), 700)
    setTimeout(() => setPhase('caller'), 1400)
    setTimeout(() => setPhase('response'), 2300)
    setTimeout(() => {
      setPhase('done')
      setRunning(false)
      setShowTranscript(true)
      updateStep({ done: true, error: undefined })
    }, 3500)
  }

  return (
    <Card>
      <CardHeader
        title="Simulate an incoming call"
        subheader="See ring → greet → capture → summary in one calm view."
      />
      <CardContent>
        <Stack spacing={2}>
          <Button
            variant="contained"
            startIcon={<PhoneInTalkIcon />}
            onClick={startSim}
            disabled={running}
          >
            {running ? 'Running simulation…' : 'Simulate Incoming Call'}
          </Button>

          <Box
            sx={{
              p: 2,
              minHeight: 110,
              borderRadius: 2,
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            {phase === 'idle' && (
              <Typography variant="body2" color="text.secondary">
                Trigger a fake call to prove the flow without touching real telephony.
              </Typography>
            )}
            {phase === 'ring' && <Typography>📞 Ringing…</Typography>}
            {phase === 'greet' && (
              <Typography>
                🤖 “Hello, you’ve reached your Comflow assistant. How can we help today?”
              </Typography>
            )}
            {phase === 'caller' && (
              <Typography>
                🗣️ Caller: “Hi, I’d like to schedule a callback about pricing.”
              </Typography>
            )}
            {phase === 'response' && (
              <Typography>
                🤖 “Got it. I’ll save your message and we’ll get back to you shortly.”
              </Typography>
            )}
            {phase === 'done' && (
              <Stack direction="row" spacing={1} alignItems="center">
                <CheckCircleIcon fontSize="small" color="success" />
                <Typography>
                  Demo call complete. Real STT / LLM / TTS / logging attach here later.
                </Typography>
              </Stack>
            )}
          </Box>

          {showTranscript && (
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <Typography variant="subtitle2" gutterBottom>
                Example transcript & summary
              </Typography>
              <Typography variant="body2">
                [00:00] Caller: “Hi, I’d like to schedule a callback about pricing.”
              </Typography>
              <Typography variant="body2">
                [00:04] Assistant summary: Caller wants a pricing callback.{' '}
                <Chip size="small" label="Sales" color="primary" />
              </Typography>
              <Typography variant="caption" color="text.secondary">
                All client-side. Backend can swap this block with live data later.
              </Typography>
            </Box>
          )}

          {wizardState.callTest.error && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ color: 'error.main' }}
            >
              <ErrorOutlineIcon fontSize="small" />
              <Typography variant="body2">
                {wizardState.callTest.error}
              </Typography>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
