import { Card, CardContent, CardHeader, Typography } from '@mui/material'

export function TranscriptPanel({ transcript }: { transcript: string | null }) {
  return (
    <Card>
      <CardHeader title="Transcript" />
      <CardContent>
        <Typography
          component="pre"
          sx={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
          }}
        >
          {transcript ?? 'No transcript yet.'}
        </Typography>
      </CardContent>
    </Card>
  )
}
