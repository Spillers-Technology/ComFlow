import { useState } from 'react'
import {
  Container,
  Stack,
  Button,
  Card,
  CardHeader,
  CardContent,
  Typography,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Divider,
  Box,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { Voicemail } from '../../types'

interface VoicemailDetailProps {
  voicemail: Voicemail
  onBack: () => void
}

export function VoicemailDetail({ voicemail, onBack }: VoicemailDetailProps) {
  const [resolution, setResolution] = useState('callback')
  const [note, setNote] = useState('')

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Button variant="text" onClick={onBack} sx={{ mb: 2 }}>
        ← Back to Dashboard
      </Button>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
        <Card sx={{ flex: 2 }}>
          <CardHeader
            title={`Voicemail from ${voicemail.from}`}
            subheader={`${voicemail.number} • ${voicemail.time}`}
          />
          <CardContent>
            <Stack spacing={1.5}>
              {voicemail.transcript.map((line, i) => (
                <Box key={i}>
                  <Typography variant="caption" color="text.secondary">
                    [{line.t}] •{' '}
                    {line.conf === 'high'
                      ? 'High'
                      : line.conf === 'med'
                      ? 'Med'
                      : 'Low'}{' '}
                    confidence
                  </Typography>
                  <Typography variant="body2">{line.text}</Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1 }}>
          <CardHeader title="Actions & details" />
          <CardContent>
            <Stack spacing={2}>
              <Button
                variant="outlined"
                startIcon={<PlayArrowIcon />}
                disabled
              >
                Play recording (coming soon)
              </Button>
              <Button variant="outlined" disabled>
                Download audio (coming soon)
              </Button>

              <Divider />

              <Typography variant="subtitle2">Tag</Typography>
              <Stack direction="row" spacing={1}>
                <Chip label="Billing" size="small" variant="outlined" />
                <Chip label="Support" size="small" variant="outlined" />
                <Chip label="Sales" size="small" variant="outlined" />
              </Stack>

              <TextField
                label="Internal notes"
                multiline
                minRows={3}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Called back, left follow-up."
              />

              <FormControl fullWidth>
                <InputLabel>Resolution</InputLabel>
                <Select
                  label="Resolution"
                  value={resolution}
                  onChange={e => setResolution(e.target.value)}
                >
                  <MenuItem value="callback">Call back</MenuItem>
                  <MenuItem value="archived">Archive</MenuItem>
                  <MenuItem value="escalate">Escalate</MenuItem>
                </Select>
              </FormControl>

              <Typography variant="caption" color="text.secondary">
                All client-side only right now. Future: sync to ticketing/CRM/API.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  )
}
