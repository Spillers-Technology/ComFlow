import { useState } from 'react'
import DownloadIcon from '@mui/icons-material/Download'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Stack,
  Typography,
} from '@mui/material'
import { downloadRecording } from '../lib/api'

export function RecordingPlayer({
  recordingUrl,
  recordingDownloadUrl,
}: {
  recordingUrl: string | null
  recordingDownloadUrl: string | null
}) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    if (!recordingDownloadUrl) return

    setDownloading(true)
    setError(null)
    try {
      await downloadRecording(recordingDownloadUrl)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Recording"
        action={
          recordingDownloadUrl ? (
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? 'Downloading...' : 'Download'}
            </Button>
          ) : null
        }
      />
      <CardContent>
        {recordingUrl ? (
          <Stack spacing={1}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography variant="body2" color="text.secondary">
              Use the player below to listen to the original voicemail recording.
            </Typography>
            <audio controls style={{ width: '100%' }} src={recordingUrl}>
              Your browser does not support audio playback.
            </audio>
          </Stack>
        ) : (
          <Typography color="text.secondary">
            No recording available for this call.
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
