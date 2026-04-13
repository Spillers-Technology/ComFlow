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
import { CallList } from '../components/CallList'
import { getCalls } from '../lib/api'

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

  useEffect(() => {
    setLoading(true)
    void getCalls({
      status: status || undefined,
      q: query || undefined,
      intent: intent || undefined,
    })
      .then(result => {
        setItems(result.items)
        setError(null)
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [status, query, intent, refreshKey])

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h3">ComFlow inbox</Typography>
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

        <CallList items={items} isLoading={loading} />
      </Stack>
    </Container>
  )
}
