import {
  Paper,
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

export function CallList({ items }: { items: CallListItem[] }) {
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
          {items.map(item => (
            <TableRow
              key={item.id}
              hover
              sx={{ cursor: 'pointer' }}
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
              <TableCell>{item.intent.replace('_', ' ')}</TableCell>
              <TableCell>{item.urgency}</TableCell>
              <TableCell>
                <CallStatusBadge status={item.status} />
              </TableCell>
              <TableCell>{item.assignedQueue ?? 'Unassigned'}</TableCell>
              <TableCell>{item.summary ?? 'No summary yet'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
