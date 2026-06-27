import { FormEvent, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { AudioPrompt, Mailbox } from '../../../shared/src/index.js'
import {
  createPrompt,
  deletePrompt,
  fileToBase64,
  getMailboxes,
  getPrompts,
  updateMailbox,
} from '../lib/api'

export function ConnectionsPage() {
  const [mailbox, setMailbox] = useState<Mailbox | null>(null)
  const [greetings, setGreetings] = useState<AudioPrompt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [greetingPromptId, setGreetingPromptId] = useState('')
  const [sipAccountRef, setSipAccountRef] = useState('')

  async function loadMailbox() {
    const result = await getMailboxes()
    const first = result.items[0] ?? null
    setMailbox(first)
    if (first) {
      setName(first.name)
      setNumber(first.number ?? '')
      setGreetingPromptId(first.greetingPromptId ?? '')
      setSipAccountRef(first.sipAccountRef ?? '')
    }
  }

  async function loadGreetings() {
    const result = await getPrompts('greeting')
    setGreetings(result.items)
  }

  useEffect(() => {
    void loadMailbox().catch(reason => setError((reason as Error).message))
    void loadGreetings().catch(() => undefined)
  }, [])

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!mailbox) return
    setError(null)
    setSaved(false)
    try {
      const updated = await updateMailbox(mailbox.id, {
        name: name.trim(),
        number: number.trim() ? number.trim() : null,
        greetingPromptId: greetingPromptId || null,
        sipAccountRef: sipAccountRef.trim() ? sipAccountRef.trim() : null,
      })
      setMailbox(updated.mailbox)
      setSaved(true)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  async function handleUploadGreeting(file: File) {
    try {
      const audioBase64 = await fileToBase64(file)
      const { prompt } = await createPrompt({
        name: file.name,
        kind: 'greeting',
        audioBase64,
        mimeType: file.type || 'audio/wav',
      })
      await loadGreetings()
      setGreetingPromptId(prompt.id)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  async function handleDeleteGreeting(id: string) {
    try {
      await deletePrompt(id)
      if (greetingPromptId === id) setGreetingPromptId('')
      await loadGreetings()
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', py: 4, px: 2 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h3">Connections</Typography>
          <Typography color="text.secondary">
            Configure the mailbox and the greeting played to inbound callers.
            (Multiple mailboxes and SSO are on the roadmap.)
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
        {saved && <Alert severity="success">Mailbox saved.</Alert>}

        <Card>
          <CardHeader title="Mailbox" />
          <CardContent>
            {mailbox ? (
              <Stack component="form" spacing={2} onSubmit={handleSave}>
                <TextField
                  label="Mailbox name"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="DID / phone number"
                  value={number}
                  onChange={event => setNumber(event.target.value)}
                  placeholder="+1 555 123 4567"
                  fullWidth
                />
                <TextField
                  select
                  label="Greeting"
                  value={greetingPromptId}
                  onChange={event => setGreetingPromptId(event.target.value)}
                  fullWidth
                >
                  <MenuItem value="">System default (none)</MenuItem>
                  {greetings.map(prompt => (
                    <MenuItem key={prompt.id} value={prompt.id}>
                      {prompt.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="SIP account reference"
                  value={sipAccountRef}
                  onChange={event => setSipAccountRef(event.target.value)}
                  placeholder="Label for the baresip account this mailbox uses"
                  helperText="Credentials live in the baresip SIP edge, not here."
                  fullWidth
                />
                <Button type="submit" variant="contained" sx={{ alignSelf: 'flex-start' }}>
                  Save mailbox
                </Button>
              </Stack>
            ) : (
              <Typography color="text.secondary">Loading mailbox…</Typography>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Greeting recordings"
            subheader="Upload your own greeting audio instead of using TTS."
          />
          <CardContent>
            <Stack spacing={2}>
              <Button
                variant="outlined"
                onClick={() => fileInput.current?.click()}
                sx={{ alignSelf: 'flex-start' }}
              >
                Upload greeting
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="audio/*"
                hidden
                onChange={event => {
                  const file = event.target.files?.[0]
                  if (file) void handleUploadGreeting(file)
                  event.target.value = ''
                }}
              />
              {greetings.length === 0 ? (
                <Typography color="text.secondary">
                  No greeting recordings uploaded.
                </Typography>
              ) : (
                greetings.map((prompt, index) => (
                  <Stack key={prompt.id} spacing={1}>
                    {index > 0 && <Divider />}
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Typography variant="subtitle1">{prompt.name}</Typography>
                      <IconButton
                        aria-label="Delete greeting"
                        onClick={() => handleDeleteGreeting(prompt.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Stack>
                    <audio controls style={{ width: '100%' }} src={prompt.audioUrl}>
                      Your browser does not support audio playback.
                    </audio>
                  </Stack>
                ))
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  )
}
