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
  TextField,
  Button,
  LinearProgress,
  Typography,
} from '@mui/material'
import CloudDoneIcon from '@mui/icons-material/CloudDone'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { WizardState } from '../../../types'

interface LlmStepProps {
  wizardState: WizardState
  updateStep: (updates: Partial<WizardState['llm']>) => void
}

export function LlmStep({ wizardState, updateStep }: LlmStepProps) {
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4.1-mini')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const onTest = () => {
    setMsg(null)
    if (!apiKey) {
      setMsg('Paste an API key (fake is fine in this demo).')
      return
    }
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      updateStep({ done: true, error: undefined })
      setMsg(
        `Demo: Pretended to send “Say hello, Comflow.” to ${provider} (${model}). Real connectivity plugs in here.`
      )
    }, 800)
  }

  return (
    <Card>
      <CardHeader
        title="Set up your AI brain"
        subheader="This is what understands callers and drafts responses."
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
            label="API Key / Token"
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            fullWidth
          />
          <TextField
            label="Model Name"
            value={model}
            onChange={e => setModel(e.target.value)}
            helperText="e.g. gpt-4.1-mini, llama3.1:8b, etc."
            fullWidth
          />

          {loading && <LinearProgress />}

          <Button
            variant="contained"
            onClick={onTest}
            endIcon={<CloudDoneIcon />}
            disabled={loading}
          >
            Send Test Prompt
          </Button>

          {msg && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CheckCircleIcon fontSize="small" color="success" />
              <Typography variant="body2">{msg}</Typography>
            </Stack>
          )}

          {wizardState.llm.error && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ color: 'error.main' }}
            >
              <ErrorOutlineIcon fontSize="small" />
              <Typography variant="body2">{wizardState.llm.error}</Typography>
            </Stack>
          )}

          <Typography variant="caption" color="text.secondary">
            Real implementation: validate key, list models, show latency, cost hints.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  )
}
