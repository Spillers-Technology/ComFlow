import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import { PlanBand, PlanDefinition } from '../../../shared/src/index.js'
import { getPlans, startSubscription } from '../lib/api'

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`
}

/**
 * The pricing bands, with a subscribe button per band. Subscribing hands off to
 * Stripe Checkout; the resulting webhook is what actually grants the plan, so
 * nothing here needs to optimistically update local state.
 */
export function PlanPicker({
  currentBand,
  onError,
}: {
  currentBand?: PlanBand | null
  onError?: (message: string) => void
}) {
  const [plans, setPlans] = useState<PlanDefinition[]>([])
  const [busyBand, setBusyBand] = useState<PlanBand | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getPlans()
      .then(result => setPlans(result.plans))
      .catch(reason => setError((reason as Error).message))
  }, [])

  async function handleSubscribe(band: PlanBand) {
    setBusyBand(band)
    setError(null)
    try {
      const { checkoutUrl } = await startSubscription(band)
      window.location.assign(checkoutUrl)
    } catch (reason) {
      const message = (reason as Error).message
      setError(message)
      onError?.(message)
      setBusyBand(null)
    }
  }

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems="stretch"
      >
        {plans.map(plan => {
          const isCurrent = plan.band === currentBand
          return (
            <Card
              key={plan.band}
              variant={isCurrent ? 'elevation' : 'outlined'}
              sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}
            >
              <CardContent
                sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}
              >
                <Stack spacing={1.5} sx={{ flex: 1 }}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Typography variant="h6" fontWeight={700}>
                      {plan.name}
                    </Typography>
                    {isCurrent && (
                      <Chip label="Current" color="primary" size="small" />
                    )}
                  </Stack>

                  <Box>
                    <Typography component="span" variant="h4" fontWeight={700}>
                      {dollars(plan.monthlyCents)}
                    </Typography>
                    <Typography component="span" color="text.secondary">
                      {' '}
                      / month
                    </Typography>
                  </Box>

                  <Typography color="text.secondary" variant="body2">
                    {plan.description}
                  </Typography>

                  <Stack spacing={0.5} sx={{ pt: 1 }}>
                    {[
                      `${plan.maxDids} phone number${plan.maxDids === 1 ? '' : 's'}`,
                      `${plan.includedMinutes} minutes included`,
                      `${plan.maxConcurrentCalls} call${
                        plan.maxConcurrentCalls === 1 ? '' : 's'
                      } at once`,
                    ].map(feature => (
                      <Stack
                        key={feature}
                        direction="row"
                        spacing={1}
                        alignItems="center"
                      >
                        <CheckIcon fontSize="small" color="success" />
                        <Typography variant="body2">{feature}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Stack>

                <Button
                  variant={isCurrent ? 'outlined' : 'contained'}
                  disabled={isCurrent || busyBand !== null}
                  onClick={() => void handleSubscribe(plan.band)}
                  sx={{ mt: 2 }}
                  fullWidth
                >
                  {isCurrent
                    ? 'Your plan'
                    : busyBand === plan.band
                      ? 'Redirecting…'
                      : `Choose ${plan.name}`}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Minutes beyond your plan draw from your wallet balance. Cancel anytime —
        your plan runs to the end of the period you've paid for.
      </Typography>
    </Stack>
  )
}
