import { FormEvent, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import {
  CallbackAttempt,
  CreateCallbackRequest,
} from '../../../shared/src/index.js'

interface CallbackPanelProps {
  callbackNumber: string | null
  attempts: CallbackAttempt[]
  creating?: boolean
  onCreate: (payload: CreateCallbackRequest) => Promise<void>
}

export function CallbackPanel({
  callbackNumber,
  attempts,
  creating,
  onCreate,
}: CallbackPanelProps) {
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    try {
      await onCreate({
        notes: notes.trim() || undefined,
      })
      setNotes('')
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Callback Flow"
        subheader="Generate a callback script with the active LLM, synthesize it with the active TTS engine, and run it through simulated telephony."
      />
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Destination: {callbackNumber ?? 'No callback number on this call'}
          </Typography>

          <Stack
            component="form"
            spacing={2}
            onSubmit={event => {
              void handleSubmit(event)
            }}
          >
            <TextField
              label="Operator notes"
              placeholder="Optional notes for the generated callback script"
              multiline
              minRows={3}
              value={notes}
              onChange={event => setNotes(event.target.value)}
              disabled={!callbackNumber || creating}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={!callbackNumber || creating}
            >
              {creating ? 'Preparing callback...' : 'Prepare callback'}
            </Button>
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}

          {attempts.length === 0 ? (
            <Typography color="text.secondary">
              No callback attempts yet.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {attempts.map((attempt, index) => (
                <Stack key={attempt.id} spacing={1.5}>
                  {index > 0 && <Divider />}
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    spacing={1}
                  >
                    <Typography variant="subtitle1" fontWeight={600}>
                      {new Date(attempt.createdAt).toLocaleString()}
                    </Typography>
                    <Typography color="text.secondary">
                      {attempt.status.replace(/_/g, ' ')}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    LLM: {attempt.providerSnapshot.llm.provider}
                    {attempt.providerSnapshot.llm.model
                      ? ` (${attempt.providerSnapshot.llm.model})`
                      : ''}
                    {'  '}TTS: {attempt.providerSnapshot.tts.provider}
                    {attempt.providerSnapshot.tts.model
                      ? ` (${attempt.providerSnapshot.tts.model})`
                      : ''}
                  </Typography>
                  {attempt.notes && (
                    <Typography variant="body2">
                      Notes: {attempt.notes}
                    </Typography>
                  )}
                  <Typography variant="body2">{attempt.script}</Typography>
                  {attempt.audioUrl ? (
                    <audio controls style={{ width: '100%' }} src={attempt.audioUrl}>
                      Your browser does not support audio playback.
                    </audio>
                  ) : (
                    <Typography color="text.secondary">
                      No synthesized audio stored for this attempt.
                    </Typography>
                  )}
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
