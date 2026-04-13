import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import {
  CallIntentSchema,
  CallRecord,
  CallStatusSchema,
  CallUpdateInput,
  CallUrgencySchema,
} from '../../../shared/src/index.js'

const intents = CallIntentSchema.options
const urgencies = CallUrgencySchema.options
const statuses = CallStatusSchema.options

export function CallMetadataForm({
  call,
  onSave,
  saving,
}: {
  call: CallRecord
  onSave: (payload: CallUpdateInput) => Promise<void>
  saving: boolean
}) {
  const [form, setForm] = useState<CallUpdateInput>({
    callerName: call.callerName,
    company: call.company,
    callbackNumber: call.callbackNumber,
    intent: call.intent,
    urgency: call.urgency,
    summary: call.summary,
    status: call.status,
    assignedQueue: call.assignedQueue,
  })

  useEffect(() => {
    setForm({
      callerName: call.callerName,
      company: call.company,
      callbackNumber: call.callbackNumber,
      intent: call.intent,
      urgency: call.urgency,
      summary: call.summary,
      status: call.status,
      assignedQueue: call.assignedQueue,
    })
  }, [call])

  const isDirty = useMemo(() => {
    return (
      form.callerName !== call.callerName ||
      form.company !== call.company ||
      form.callbackNumber !== call.callbackNumber ||
      form.intent !== call.intent ||
      form.urgency !== call.urgency ||
      form.summary !== call.summary ||
      form.status !== call.status ||
      form.assignedQueue !== call.assignedQueue
    )
  }, [form, call])

  return (
    <Card>
      <CardHeader title="Review metadata" />
      <CardContent>
        <Stack spacing={2}>
          <TextField
            label="Caller name"
            value={form.callerName ?? ''}
            onChange={event =>
              setForm(current => ({ ...current, callerName: event.target.value || null }))
            }
          />
          <TextField
            label="Company"
            value={form.company ?? ''}
            onChange={event =>
              setForm(current => ({ ...current, company: event.target.value || null }))
            }
          />
          <TextField
            label="Callback number"
            value={form.callbackNumber ?? ''}
            onChange={event =>
              setForm(current => ({
                ...current,
                callbackNumber: event.target.value || null,
              }))
            }
          />
          <FormControl fullWidth>
            <InputLabel>Intent</InputLabel>
            <Select
              label="Intent"
              value={form.intent ?? 'unknown'}
              onChange={event =>
                setForm(current => ({ ...current, intent: event.target.value as typeof call.intent }))
              }
            >
              {intents.map(intent => (
                <MenuItem key={intent} value={intent}>
                  {intent.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Urgency</InputLabel>
            <Select
              label="Urgency"
              value={form.urgency ?? 'unknown'}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  urgency: event.target.value as typeof call.urgency,
                }))
              }
            >
              {urgencies.map(urgency => (
                <MenuItem key={urgency} value={urgency}>
                  {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={form.status ?? 'new'}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  status: event.target.value as typeof call.status,
                }))
              }
            >
              {statuses.map(status => (
                <MenuItem key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Assigned queue"
            value={form.assignedQueue ?? ''}
            onChange={event =>
              setForm(current => ({
                ...current,
                assignedQueue: event.target.value || null,
              }))
            }
          />
          <TextField
            label="Summary"
            multiline
            minRows={4}
            value={form.summary ?? ''}
            onChange={event =>
              setForm(current => ({ ...current, summary: event.target.value || null }))
            }
          />
          {isDirty && (
            <Typography variant="caption" color="warning.main">
              Unsaved changes
            </Typography>
          )}
          <Button
            variant="contained"
            disabled={saving || !isDirty}
            onClick={() => void onSave(form)}
          >
            {saving ? 'Saving...' : 'Save review'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}
