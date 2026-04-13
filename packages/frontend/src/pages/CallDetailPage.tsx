import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Container,
  Grid,
  Stack,
  Typography,
} from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'
import {
  CallRecord,
  CallUpdateInput,
  GetCallResponse,
} from '../../../shared/src/index.js'
import { CallMetadataForm } from '../components/CallMetadataForm'
import { CallStatusBadge } from '../components/CallStatusBadge'
import { NotesPanel } from '../components/NotesPanel'
import { RecordingPlayer } from '../components/RecordingPlayer'
import { TranscriptPanel } from '../components/TranscriptPanel'
import { addCallNote, getCall, patchCall } from '../lib/api'

export function CallDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<GetCallResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    void load()
  }, [id])

  async function load() {
    if (!id) return
    try {
      const result = await getCall(id)
      setDetail(result)
      setError(null)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  async function handleSave(payload: CallUpdateInput) {
    if (!id) return
    setSaving(true)
    try {
      await patchCall(id, payload)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleAddNote(payload: { body: string; authorName?: string }) {
    if (!id) return
    await addCallNote(id, payload)
    await load()
  }

  if (!id) {
    return null
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Button variant="text" onClick={() => navigate('/calls')} sx={{ alignSelf: 'flex-start' }}>
          Back to inbox
        </Button>

        {error && <Alert severity="error">{error}</Alert>}

        {detail && (
          <>
            <CallSummaryHeader call={detail.call} />
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 7 }}>
                <Stack spacing={3}>
                  <RecordingPlayer recordingUrl={detail.recordingUrl} />
                  <TranscriptPanel transcript={detail.call.transcript} />
                  <NotesPanel notes={detail.notes} onAddNote={handleAddNote} />
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <CallMetadataForm
                  call={detail.call}
                  onSave={handleSave}
                  saving={saving}
                />
              </Grid>
            </Grid>
          </>
        )}
      </Stack>
    </Container>
  )
}

function CallSummaryHeader({ call }: { call: CallRecord }) {
  return (
    <Stack spacing={1}>
      <Typography variant="h3">
        {call.callerName ?? 'Unknown caller'}
      </Typography>
      <Typography color="text.secondary">
        {call.company ?? 'No company'} • {call.callbackNumber ?? 'No callback'}
      </Typography>
      <Stack direction="row" spacing={1}>
        <CallStatusBadge status={call.status} />
        <Typography color="text.secondary">
          Intent: {call.intent.replace('_', ' ')}
        </Typography>
        <Typography color="text.secondary">Urgency: {call.urgency}</Typography>
      </Stack>
    </Stack>
  )
}
