import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Container,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import { CallIntentSchema, CallListItem, CallStatusSchema } from '../../../shared/src/index.js'
import { useAuth } from '../app/AuthContext'
import { CallList } from '../components/CallList'
import { getCalls, getMailboxes } from '../lib/api'

function formatIntent(intent: string): string {
  return intent.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function CallInboxPage() {
  const [items, setItems] = useState<CallListItem[]>([])
  const [status, setStatus] = useState<string>('')
  const [intent, setIntent] = useState<string>('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [mailboxCount, setMailboxCount] = useState<number | null>(null)
  const { user, authRequired } = useAuth()

  useEffect(() => {
    void getMailboxes()
      .then(result => setMailboxCount(result.items.length))
      .catch(() => setMailboxCount(null))
  }, [])

  // A member with no granted mailboxes has nothing to see — explain why.
  const noMailboxAccess =
    authRequired && user?.role === 'member' && mailboxCount === 0

  useEffect(() => {
    let cancelled = false

    function fetchCalls(showSpinner: boolean) {
      if (showSpinner) setLoading(true)
      void getCalls({
        status: status || undefined,
        q: query || undefined,
        intent: intent || undefined,
      })
        .then(result => {
          if (cancelled) return
          setItems(result.items)
          setError(null)
        })
        .catch((reason: Error) => {
          if (!cancelled) setError(reason.message)
        })
        .finally(() => {
          if (!cancelled && showSpinner) setLoading(false)
        })
    }

    fetchCalls(true)
    // Light polling so freshly captured voicemails surface without a manual refresh.
    const timer = setInterval(() => fetchCalls(false), 15_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [status, query, intent, refreshKey])

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>ComFlow inbox</Typography>
          <Typography color="text.secondary">
            Review new calls, confirm what matters, and move the next action
            forward.
          </Typography>
          {!loading && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {items.length} {items.length === 1 ? 'call' : 'calls'}
            </Typography>
          )}
        </Box>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={status}
              onChange={event => setStatus(event.target.value)}
            >
              <MenuItem value="">All statuses</MenuItem>
              {CallStatusSchema.options.map(option => (
                <MenuItem key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Intent</InputLabel>
            <Select
              label="Intent"
              value={intent}
              onChange={event => setIntent(event.target.value)}
            >
              <MenuItem value="">All intents</MenuItem>
              {CallIntentSchema.options.map(option => (
                <MenuItem key={option} value={option}>
                  {formatIntent(option)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Caller, company, summary, or number"
            fullWidth
          />

          <Tooltip title="Refresh">
            <IconButton onClick={() => setRefreshKey(k => k + 1)} aria-label="Refresh calls">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        {noMailboxAccess ? (
          <Alert severity="info">
            No mailboxes assigned yet — ask an admin to add you to a group with
            mailbox access.
          </Alert>
        ) : (
          <CallList items={items} isLoading={loading} />
        )}
      </Stack>
    </Container>
  )
}
