import { Chip } from '@mui/material'
import { CallStatus } from '../../../shared/src/index.js'

const colors: Record<CallStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  new: 'warning',
  reviewed: 'info',
  assigned: 'info',
  resolved: 'success',
  spam: 'error',
}

export function CallStatusBadge({ status }: { status: CallStatus }) {
  return <Chip size="small" label={status.replace('_', ' ')} color={colors[status]} />
}
