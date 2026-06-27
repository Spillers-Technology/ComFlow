import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Chip,
  Container,
  Grid,
  Skeleton,
  Snackbar,
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
import { UrgencyBadge } from '../components/UrgencyBadge'
import { addCallNote, getCall, patchCall } from '../lib/api'

interface SnackbarState {
  open: boolean
  message: string
  severity: 'success' | 'error'
}

export function CallDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<GetCallResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'success',
  })

  useEffect(() => {
    if (!id) return
    const currentId = id
    let cancelled = false

    async function load() {
      try {
        const result = await getCall(currentId)
        if (cancelled) return
        setDetail(result)
        setError(null)
      } catch (reason) {
        if (cancelled) return
        setError((reason as Error).message)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
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
      setSnackbar({ open: true, message: 'Changes saved.', severity: 'success' })
    } catch (reason) {
      setSnackbar({
        open: true,
        message: (reason as Error).message,
        severity: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleAddNote(payload: { body: string; authorName?: string }) {
    if (!id) return
    await addCallNote(id, payload)
    await load()
  }

  function closeSnackbar() {
    setSnackbar(s => ({ ...s, open: false }))
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

        {!detail && !error && (
          <Stack spacing={3}>
            <Skeleton variant="text" width={300} height={56} />
            <Skeleton variant="text" width={240} height={28} />
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 7 }}>
                <Stack spacing={3}>
                  <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
                  <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 2 }} />
                  <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <Skeleton variant="rectangular" height={540} sx={{ borderRadius: 2 }} />
              </Grid>
            </Grid>
          </Stack>
        )}

        {detail && (
          <>
            <CallSummaryHeader call={detail.call} />
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 7 }}>
                <Stack spacing={3}>
                  <RecordingPlayer
                    recordingUrl={detail.recordingUrl}
                    recordingDownloadUrl={detail.recordingDownloadUrl}
                  />
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

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={closeSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={closeSnackbar}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  )
}

function CallSummaryHeader({ call }: { call: CallRecord }) {
  const formattedIntent = call.intent.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <Stack spacing={1}>
      <Typography variant="h3">
        {call.callerName ?? 'Unknown caller'}
      </Typography>
      <Typography color="text.secondary">
        {call.company ?? 'No company'} • {call.callbackNumber ?? 'No callback'}
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <CallStatusBadge status={call.status} />
        <UrgencyBadge urgency={call.urgency} />
        <Typography color="text.secondary">
          {formattedIntent}
        </Typography>
        {call.syncedTicketId && (
          <Chip
            size="small"
            color="success"
            variant="outlined"
            label={`Synced to AnchorDesk #${call.syncedTicketId}`}
          />
        )}
      </Stack>
    </Stack>
  )
}
