import { FormEvent, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { AudioPrompt, ScheduledCall } from '../../../shared/src/index.js'
import {
  AudioOrTextField,
  AudioOrTextValue,
} from '../components/AudioOrTextField'
import {
  cancelScheduledCall,
  createScheduledCall,
  getPrompts,
  getScheduledCalls,
} from '../lib/api'
import { OutboundAccessCard } from '../components/OutboundAccessCard'

const STATUS_COLOR: Record<
  ScheduledCall['status'],
  'default' | 'info' | 'success' | 'warning' | 'error'
> = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  no_answer: 'warning',
  failed: 'error',
  canceled: 'default',
}

export function ScheduledCallsPage() {
  const [items, setItems] = useState<ScheduledCall[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [toNumber, setToNumber] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [message, setMessage] = useState<AudioOrTextValue>({
    mode: 'text',
    text: '',
  })
  const [question, setQuestion] = useState<AudioOrTextValue>({
    mode: 'text',
    text: '',
  })
  const [prompts, setPrompts] = useState<AudioPrompt[]>([])

  async function load() {
    try {
      const result = await getScheduledCalls()
      setItems(result.items)
      setError(null)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  async function loadPrompts() {
    try {
      const result = await getPrompts('outbound')
      setPrompts(result.items)
    } catch {
      // Non-fatal: the text path still works without prompts.
    }
  }

  useEffect(() => {
    void load()
    void loadPrompts()
    // Refresh periodically so call results appear as the scheduler runs them.
    const timer = setInterval(() => void load(), 10_000)
    return () => clearInterval(timer)
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await createScheduledCall({
        toNumber: toNumber.trim(),
        scheduledAt: new Date(scheduledAt).toISOString(),
        messageText: message.mode === 'text' ? message.text.trim() : undefined,
        messageAudioPromptId:
          message.mode === 'upload' ? message.promptId : undefined,
        questionText:
          question.mode === 'text' ? question.text.trim() : undefined,
        questionAudioPromptId:
          question.mode === 'upload' ? question.promptId : undefined,
      })
      setToNumber('')
      setScheduledAt('')
      setMessage({ mode: 'text', text: '' })
      setQuestion({ mode: 'text', text: '' })
      await load()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  function segmentReady(value: AudioOrTextValue): boolean {
    return value.mode === 'text'
      ? value.text.trim().length > 0
      : value.promptId.length > 0
  }

  async function handleCancel(id: string) {
    try {
      await cancelScheduledCall(id)
      await load()
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  const canSubmit =
    toNumber.trim() &&
    scheduledAt &&
    segmentReady(message) &&
    segmentReady(question)

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Scheduled calls</Typography>
          <Typography color="text.secondary">
            Schedule a call that plays a pre-generated message, asks one
            question, and best-effort captures the answer. No conversation, no
            answering-machine detection.
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        {/* Shows the request form when outbound is off, so the gate appears
            exactly where someone tries to use the feature. */}
        <OutboundAccessCard />

        <Card>
          <CardContent>
            <Stack component="form" spacing={2} onSubmit={handleSubmit}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Number to call"
                  placeholder="+1 555 123 4567"
                  value={toNumber}
                  onChange={event => setToNumber(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="When"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={event => setScheduledAt(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Stack>
              <AudioOrTextField
                label="Message"
                value={message}
                prompts={prompts}
                onChange={setMessage}
                onPromptUploaded={loadPrompts}
              />
              <AudioOrTextField
                label="Question"
                value={question}
                prompts={prompts}
                onChange={setQuestion}
                onPromptUploaded={loadPrompts}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={!canSubmit || submitting}
                sx={{ alignSelf: 'flex-start' }}
              >
                {submitting ? 'Scheduling…' : 'Schedule call'}
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Stack spacing={2}>
          {items.length === 0 ? (
            <Typography color="text.secondary">
              No scheduled calls yet.
            </Typography>
          ) : (
            items.map(item => (
              <Card key={item.id}>
                <CardContent>
                  <Stack spacing={1.5}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Typography variant="h6">{item.toNumber}</Typography>
                      <Chip
                        label={item.status.replace(/_/g, ' ')}
                        color={STATUS_COLOR[item.status]}
                        size="small"
                      />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(item.scheduledAt).toLocaleString()}
                    </Typography>
                    <Divider />
                    <Typography variant="body2">
                      <strong>Message:</strong>{' '}
                      {item.messageText || '(uploaded audio)'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Question:</strong>{' '}
                      {item.questionText || '(uploaded audio)'}
                    </Typography>

                    {item.answerTranscript && (
                      <Typography variant="body2">
                        <strong>Captured answer:</strong>{' '}
                        {item.answerTranscript}
                      </Typography>
                    )}
                    {item.answerRecordingUrl && (
                      <audio
                        controls
                        style={{ width: '100%' }}
                        src={item.answerRecordingUrl}
                      >
                        Your browser does not support audio playback.
                      </audio>
                    )}
                    {item.lastError && (
                      <Alert severity="error">{item.lastError}</Alert>
                    )}

                    {item.status === 'scheduled' && (
                      <Button
                        variant="text"
                        color="error"
                        onClick={() => handleCancel(item.id)}
                        sx={{ alignSelf: 'flex-start' }}
                      >
                        Cancel
                      </Button>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            ))
          )}
        </Stack>
      </Stack>
    </Container>
  )
}
