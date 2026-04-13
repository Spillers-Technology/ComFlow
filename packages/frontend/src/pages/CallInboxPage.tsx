import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { CallListItem, CallStatusSchema } from '../../../shared/src/index.js'
import { CallList } from '../components/CallList'
import { getCalls } from '../lib/api'

export function CallInboxPage() {
  const [items, setItems] = useState<CallListItem[]>([])
  const [status, setStatus] = useState<string>('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getCalls({ status: status || undefined, q: query || undefined })
      .then(result => {
        setItems(result.items)
        setError(null)
      })
      .catch((reason: Error) => setError(reason.message))
  }, [status, query])

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h3">ComFlow inbox</Typography>
          <Typography color="text.secondary">
            Review new calls, confirm what matters, and move the next action
            forward.
          </Typography>
        </Box>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <FormControl sx={{ minWidth: 220 }}>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={status}
              onChange={event => setStatus(event.target.value)}
            >
              <MenuItem value="">All statuses</MenuItem>
              {CallStatusSchema.options.map(option => (
                <MenuItem key={option} value={option}>
                  {option}
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
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        <CallList items={items} />
      </Stack>
    </Container>
  )
}
