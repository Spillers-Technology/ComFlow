import {
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { CallListItem } from '../../../shared/src/index.js'
import { CallStatusBadge } from './CallStatusBadge'
import { UrgencyBadge } from './UrgencyBadge'

function formatIntent(intent: string): string {
  return intent.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const SKELETON_ROWS = 5

export function CallList({ items, isLoading }: { items: CallListItem[]; isLoading?: boolean }) {
  const navigate = useNavigate()

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Received</TableCell>
            <TableCell>Caller</TableCell>
            <TableCell>Callback</TableCell>
            <TableCell>Intent</TableCell>
            <TableCell>Urgency</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Queue</TableCell>
            <TableCell>Summary</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {isLoading && Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <TableRow key={`skeleton-${i}`}>
              <TableCell><Skeleton variant="text" /></TableCell>
              <TableCell><Skeleton variant="text" /></TableCell>
              <TableCell><Skeleton variant="text" /></TableCell>
              <TableCell><Skeleton variant="text" /></TableCell>
              <TableCell><Skeleton variant="text" width={60} /></TableCell>
              <TableCell><Skeleton variant="text" width={70} /></TableCell>
              <TableCell><Skeleton variant="text" /></TableCell>
              <TableCell><Skeleton variant="text" /></TableCell>
            </TableRow>
          ))}

          {!isLoading && items.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                <Typography color="text.secondary">No calls match your filters.</Typography>
              </TableCell>
            </TableRow>
          )}

          {!isLoading && items.map(item => {
            const isNew = item.status === 'new'
            return (
            <TableRow
              key={item.id}
              hover
              sx={{
                cursor: 'pointer',
                // Emphasize unreviewed ("new") voicemails with a left accent.
                borderLeft: isNew ? 3 : 0,
                borderColor: 'primary.main',
                bgcolor: isNew ? 'action.hover' : undefined,
              }}
              onClick={() => navigate(`/calls/${item.id}`)}
            >
              <TableCell>{new Date(item.createdAt).toLocaleString()}</TableCell>
              <TableCell>
                <Typography variant="body2" fontWeight={600}>
                  {item.callerName ?? 'Unknown caller'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {item.company ?? item.source}
                </Typography>
              </TableCell>
              <TableCell>{item.callbackNumber ?? 'Unknown'}</TableCell>
              <TableCell>{formatIntent(item.intent)}</TableCell>
              <TableCell>
                <UrgencyBadge urgency={item.urgency} />
              </TableCell>
              <TableCell>
                <CallStatusBadge status={item.status} />
              </TableCell>
              <TableCell>{item.assignedQueue ?? 'Unassigned'}</TableCell>
              <TableCell>{item.summary ?? 'No summary yet'}</TableCell>
            </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
