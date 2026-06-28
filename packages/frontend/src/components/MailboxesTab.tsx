import { FormEvent, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { AudioPrompt, Mailbox } from '../../../shared/src/index.js'
import {
  createMailbox,
  deleteMailbox,
  getMailboxes,
  getPrompts,
  updateMailbox,
} from '../lib/api'

export function MailboxesTab() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [greetings, setGreetings] = useState<AudioPrompt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Edit form for the selected mailbox.
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [greetingPromptId, setGreetingPromptId] = useState('')
  const [sipAccountRef, setSipAccountRef] = useState('')

  // New-mailbox form.
  const [newName, setNewName] = useState('')
  const [newNumber, setNewNumber] = useState('')
  const [newSipAccountRef, setNewSipAccountRef] = useState('')

  const selected = mailboxes.find(mailbox => mailbox.id === selectedId) ?? null

  function applyForm(mailbox: Mailbox | null) {
    setName(mailbox?.name ?? '')
    setNumber(mailbox?.number ?? '')
    setGreetingPromptId(mailbox?.greetingPromptId ?? '')
    setSipAccountRef(mailbox?.sipAccountRef ?? '')
  }

  async function loadMailboxes(selectId?: string) {
    const result = await getMailboxes()
    setMailboxes(result.items)
    const next =
      result.items.find(mailbox => mailbox.id === selectId) ??
      result.items.find(mailbox => mailbox.id === selectedId) ??
      result.items[0] ??
      null
    setSelectedId(next?.id ?? '')
    applyForm(next)
  }

  useEffect(() => {
    void loadMailboxes().catch(reason => setError((reason as Error).message))
    void getPrompts('greeting')
      .then(result => setGreetings(result.items))
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectMailbox(id: string) {
    setSelectedId(id)
    applyForm(mailboxes.find(mailbox => mailbox.id === id) ?? null)
    setNotice(null)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    setError(null)
    setNotice(null)
    try {
      const updated = await updateMailbox(selected.id, {
        name: name.trim(),
        number: number.trim() ? number.trim() : null,
        greetingPromptId: greetingPromptId || null,
        sipAccountRef: sipAccountRef.trim() ? sipAccountRef.trim() : null,
      })
      setMailboxes(current =>
        current.map(mailbox =>
          mailbox.id === updated.mailbox.id ? updated.mailbox : mailbox
        )
      )
      setNotice('Mailbox saved.')
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    try {
      const created = await createMailbox({
        name: newName.trim(),
        number: newNumber.trim() ? newNumber.trim() : null,
        sipAccountRef: newSipAccountRef.trim() ? newSipAccountRef.trim() : null,
      })
      setNewName('')
      setNewNumber('')
      setNewSipAccountRef('')
      await loadMailboxes(created.mailbox.id)
      setNotice('Mailbox created.')
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  async function handleDelete() {
    if (!selected) return
    setError(null)
    setNotice(null)
    try {
      await deleteMailbox(selected.id)
      await loadMailboxes()
      setNotice('Mailbox deleted; its calls moved to another mailbox.')
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}

      <Card>
        <CardHeader
          title="Mailboxes"
          subheader="Each mailbox is a DID/line. Inbound calls route by dialed number (DID → mailbox number), then by SIP account, else the default mailbox."
        />
        <CardContent>
          {selected ? (
            <Stack component="form" spacing={2} onSubmit={handleSave}>
              <TextField
                select
                label="Mailbox"
                value={selectedId}
                onChange={event => selectMailbox(event.target.value)}
                fullWidth
              >
                {mailboxes.map(mailbox => (
                  <MenuItem key={mailbox.id} value={mailbox.id}>
                    {mailbox.name}
                    {mailbox.number ? ` · ${mailbox.number}` : ''}
                  </MenuItem>
                ))}
              </TextField>

              <Divider />

              <TextField
                label="Mailbox name"
                value={name}
                onChange={event => setName(event.target.value)}
                fullWidth
              />
              <TextField
                label="DID / phone number"
                helperText="The dialed number callers reach; used to route inbound calls to this mailbox."
                value={number}
                onChange={event => setNumber(event.target.value)}
                fullWidth
              />
              <TextField
                select
                label="Greeting"
                value={greetingPromptId}
                onChange={event => setGreetingPromptId(event.target.value)}
                fullWidth
              >
                <MenuItem value="">No greeting</MenuItem>
                {greetings.map(prompt => (
                  <MenuItem key={prompt.id} value={prompt.id}>
                    {prompt.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="SIP account reference"
                helperText="Optional: the baresip account label this mailbox receives on."
                value={sipAccountRef}
                onChange={event => setSipAccountRef(event.target.value)}
                fullWidth
              />

              <Stack direction="row" spacing={2}>
                <Button type="submit" variant="contained" disabled={!name.trim()}>
                  Save mailbox
                </Button>
                <Button
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => void handleDelete()}
                  disabled={mailboxes.length <= 1}
                >
                  Delete
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Typography color="text.secondary">No mailboxes yet.</Typography>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Add mailbox" />
        <CardContent>
          <Stack
            component="form"
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            onSubmit={handleCreate}
          >
            <TextField
              label="Name"
              value={newName}
              onChange={event => setNewName(event.target.value)}
              fullWidth
            />
            <TextField
              label="DID / number"
              value={newNumber}
              onChange={event => setNewNumber(event.target.value)}
              fullWidth
            />
            <TextField
              label="SIP account ref"
              value={newSipAccountRef}
              onChange={event => setNewSipAccountRef(event.target.value)}
              fullWidth
            />
            <Button type="submit" variant="contained" disabled={!newName.trim()}>
              Add
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}
