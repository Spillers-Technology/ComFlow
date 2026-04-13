import { Card, CardContent, CardHeader, Typography } from '@mui/material'

export function RecordingPlayer({ recordingUrl }: { recordingUrl: string | null }) {
  return (
    <Card>
      <CardHeader title="Recording" />
      <CardContent>
        {recordingUrl ? (
          <audio controls style={{ width: '100%' }} src={recordingUrl}>
            Your browser does not support audio playback.
          </audio>
        ) : (
          <Typography color="text.secondary">
            Recording not available yet.
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
