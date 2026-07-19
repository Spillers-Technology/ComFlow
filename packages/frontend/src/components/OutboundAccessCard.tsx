import { FormEvent, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Chip,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { OutboundStatus } from '../../../shared/src/index.js'
import { getOutboundStatus, requestOutboundAccess } from '../lib/api'

const MIN_USE_CASE = 20

/**
 * Outbound calling is off until someone at ComFlow has spoken to the customer.
 * This card collects the use case and an explicit consent attestation, then
 * notifies the team — it never grants access itself.
 */
export function OutboundAccessCard() {
  const [status, setStatus] = useState<OutboundStatus | null>(null)
  const [useCase, setUseCase] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getOutboundStatus()
      .then(setStatus)
      .catch(reason => setError((reason as Error).message))
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await requestOutboundAccess({
        useCase: useCase.trim(),
        contactPhone: contactPhone.trim(),
        consentAttested: true,
      })
      setSubmitted(true)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!status) return null

  if (status.enabled) {
    return (
      <Card>
        <CardHeader
          title="Outbound calling"
          action={<Chip label="Enabled" color="success" size="small" />}
        />
        <CardContent>
          <Typography color="text.secondary">
            Scheduled outbound calls are enabled for this account, capped at{' '}
            {status.maxPerDay} calls and $
            {(status.maxSpendPerDayCents / 100).toFixed(2)} per day. US and
            Canada destinations only.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        title="Outbound calling"
        subheader="Off by default. We enable it after a short call — it's how we keep the platform clean."
        action={<Chip label="Off" size="small" />}
      />
      <CardContent>
        {submitted ? (
          <Alert severity="success">
            Request received. We'll call you back on {contactPhone} to get you
            set up.
          </Alert>
        ) : (
          <Stack component="form" spacing={2} onSubmit={handleSubmit}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="What will you use outbound calling for?"
              value={useCase}
              onChange={event => setUseCase(event.target.value)}
              multiline
              minRows={3}
              required
              fullWidth
              helperText={`Tell us who you'll be calling and why. At least ${MIN_USE_CASE} characters.`}
            />
            <TextField
              label="Best number to reach you"
              value={contactPhone}
              onChange={event => setContactPhone(event.target.value)}
              required
              sx={{ maxWidth: 280 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={consent}
                  onChange={event => setConsent(event.target.checked)}
                />
              }
              label="I confirm the people I call have agreed to be contacted by me."
            />
            <Button
              type="submit"
              variant="contained"
              disabled={
                submitting ||
                !consent ||
                useCase.trim().length < MIN_USE_CASE ||
                !contactPhone.trim()
              }
              sx={{ alignSelf: 'flex-start' }}
            >
              {submitting ? 'Sending…' : 'Request outbound access'}
            </Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}
