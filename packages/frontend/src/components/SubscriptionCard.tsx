import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material'
import {
  PLAN_CATALOG,
  Subscription,
  statusGrantsService,
} from '../../../shared/src/index.js'
import { getSubscription, openBillingPortal } from '../lib/api'
import { PlanPicker } from './PlanPicker'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Current plan and its period, plus the entry point to Stripe's hosted portal.
 * With no active subscription this becomes the plan picker, so an unsubscribed
 * account always sees the thing it needs to do next.
 */
export function SubscriptionCard() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openingPortal, setOpeningPortal] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await getSubscription()
      setSubscription(result.subscription)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handlePortal() {
    setOpeningPortal(true)
    setError(null)
    try {
      const { portalUrl } = await openBillingPortal()
      window.location.assign(portalUrl)
    } catch (reason) {
      setError((reason as Error).message)
      setOpeningPortal(false)
    }
  }

  if (loading) return <LinearProgress />

  const active = subscription && statusGrantsService(subscription.status)
  const plan = subscription ? PLAN_CATALOG[subscription.band] : null

  if (!active || !plan || subscription.band === 'free') {
    return (
      <Card>
        <CardHeader
          title="Choose a plan"
          subheader="A plan gives you a phone number, included minutes, and concurrent calls."
        />
        <CardContent>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            {subscription?.status === 'unpaid' && (
              <Alert severity="warning">
                We couldn't collect your last payment, so service is paused.
                Choosing a plan again will restart it.
              </Alert>
            )}
            <PlanPicker currentBand={subscription?.band} onError={setError} />
          </Stack>
        </CardContent>
      </Card>
    )
  }

  const minutesUsed = subscription.includedMinutesUsed
  const overage = Math.max(0, minutesUsed - plan.includedMinutes)

  return (
    <Card>
      <CardHeader
        title="Plan"
        action={
          <Chip
            label={subscription.status === 'past_due' ? 'Payment overdue' : plan.name}
            color={subscription.status === 'past_due' ? 'warning' : 'primary'}
            size="small"
          />
        }
      />
      <CardContent>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}

          {subscription.status === 'past_due' && (
            <Alert severity="warning">
              Your last payment didn't go through. Update your card to keep
              service running.
            </Alert>
          )}
          {subscription.cancelAtPeriodEnd && (
            <Alert severity="info">
              Your plan is set to cancel on{' '}
              {formatDate(subscription.currentPeriodEnd)}. You keep full service
              until then.
            </Alert>
          )}

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={4}
            divider={<Divider orientation="vertical" flexItem />}
          >
            <Stack>
              <Typography variant="caption" color="text.secondary">
                Plan
              </Typography>
              <Typography variant="h6">
                {plan.name} — ${(plan.monthlyCents / 100).toFixed(0)}/mo
              </Typography>
            </Stack>
            <Stack>
              <Typography variant="caption" color="text.secondary">
                Minutes this period
              </Typography>
              <Typography variant="h6">
                {minutesUsed} / {plan.includedMinutes}
              </Typography>
            </Stack>
            <Stack>
              <Typography variant="caption" color="text.secondary">
                Renews
              </Typography>
              <Typography variant="h6">
                {formatDate(subscription.currentPeriodEnd)}
              </Typography>
            </Stack>
          </Stack>

          {overage > 0 && (
            <Typography variant="body2" color="text.secondary">
              {overage} minute{overage === 1 ? '' : 's'} past your plan this
              period, billed against your wallet.
            </Typography>
          )}

          <Button
            variant="outlined"
            onClick={() => void handlePortal()}
            disabled={openingPortal}
            sx={{ alignSelf: 'flex-start' }}
          >
            {openingPortal
              ? 'Opening…'
              : 'Manage plan, card, or cancel'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}
