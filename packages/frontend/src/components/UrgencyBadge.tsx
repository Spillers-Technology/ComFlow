import { Chip } from '@mui/material'
import { CallUrgency } from '../../../shared/src/index.js'

const colors: Record<CallUrgency, 'default' | 'error' | 'warning' | 'success'> = {
  high: 'error',
  normal: 'warning',
  low: 'success',
  unknown: 'default',
}

export function UrgencyBadge({ urgency }: { urgency: CallUrgency }) {
  const label = urgency.charAt(0).toUpperCase() + urgency.slice(1)
  return <Chip size="small" label={label} color={colors[urgency]} />
}
