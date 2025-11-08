import { Stack, Box, Typography } from '@mui/material'

type Status = 'green' | 'amber' | 'red'

interface HealthRowProps {
  label: string
  status: Status
  note: string
}

export function HealthRow({ label, status, note }: HealthRowProps) {
  const color =
    status === 'green'
      ? 'success.main'
      : status === 'amber'
      ? 'warning.main'
      : 'error.main'

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          bgcolor: color,
        }}
      />
      <Typography variant="body2">{label}</Typography>
      <Typography variant="caption" color="text.secondary">
        {note}
      </Typography>
    </Stack>
  )
}
