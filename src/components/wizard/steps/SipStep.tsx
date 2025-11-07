import { useState } from 'react'
import {
  Card,
  CardHeader,
  CardContent,
  Stack,
  TextField,
  Button,
  Tooltip,
  LinearProgress,
  Typography,
} from '@mui/material'
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { WizardState } from '../../../types'

interface SipStepProps {
  wizardState: WizardState
  updateStep: (updates: Partial<WizardState['sip']>) => void
}

export function SipStep({ wizardState, updateStep }: SipStepProps) {
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

    setTimeout(() => {
      setLoading(false)
      // No backend yet: mark as done, explain stub.
      updateStep({ done: true, error: undefined })
      setMsg(
        'Demo: Details captured. When backend exists, this will live-check registration and show exact status.'
      )
    }, 800)
  }

  return (
    <Card>
      <CardHeader
        title="Connect your phone line"
        subheader="Tell Comflow which number to listen on."
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
            <Tooltip title="Provider-specific help appears here once docs are wired.">
              <span>
                <Button variant="text" size="small" disabled>
                  How to find these in Twilio / Callcentric
                </Button>
              </span>
            </Tooltip>
          </Stack>

          <Typography variant="caption" color="text.secondary">
            Currently stored only in memory. No live calls. Safe playground.
          </Typography>

          {msg && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CheckCircleIcon fontSize="small" color="success" />
              <Typography variant="body2">{msg}</Typography>
            </Stack>
          )}

          {wizardState.sip.error && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ color: 'error.main' }}
            >
              <ErrorOutlineIcon fontSize="small" />
              <Typography variant="body2">{wizardState.sip.error}</Typography>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
