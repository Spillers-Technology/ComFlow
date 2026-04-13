import { useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  List,
  ListItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { CallNote } from '../../../shared/src/index.js'

export function NotesPanel({
  notes,
  onAddNote,
}: {
  notes: CallNote[]
  onAddNote: (payload: { body: string; authorName?: string }) => Promise<void>
}) {
  const [body, setBody] = useState('')

  return (
    <Card>
      <CardHeader title="Notes" />
      <CardContent>
        <Stack spacing={2}>
          <List disablePadding>
            {notes.map(note => (
              <ListItem key={note.id} disableGutters sx={{ display: 'block' }}>
                <Typography variant="body2">{note.body}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {(note.authorName ?? 'Unknown')} •{' '}
                  {new Date(note.createdAt).toLocaleString()}
                </Typography>
                <Divider sx={{ mt: 1.5 }} />
              </ListItem>
            ))}
            {notes.length === 0 && (
              <Typography color="text.secondary">
                No notes yet.
              </Typography>
            )}
          </List>

          <TextField
            label="Add note"
            multiline
            minRows={3}
            value={body}
            onChange={event => setBody(event.target.value)}
          />
          <Button
            variant="outlined"
            disabled={!body.trim()}
            onClick={async () => {
              await onAddNote({ body, authorName: 'ComFlow Operator' })
              setBody('')
            }}
          >
            Add note
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}
