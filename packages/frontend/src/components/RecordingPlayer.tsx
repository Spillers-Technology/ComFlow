import { Card, CardContent, CardHeader, Stack, Typography } from '@mui/material'

export function RecordingPlayer({ recordingUrl }: { recordingUrl: string | null }) {
  return (
    <Card>
      <CardHeader title="Recording" />
      <CardContent>
        {recordingUrl ? (
          <Stack spacing={1}>
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
