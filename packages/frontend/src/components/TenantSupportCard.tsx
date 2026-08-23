import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import {
  PLAN_CATALOG,
  Subscription,
  Wallet,
} from '../../../shared/src/index.js'
import {
  adjustTenantWallet,
  getTenantSubscription,
  refundTenantCharge,
} from '../lib/api'

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

/**
 * Owner-only support tools for one tenant: see what they pay, credit their
 * wallet, or refund a charge. Every action here writes an audit row.
 */
export function TenantSupportCard({ tenantId }: { tenantId: string }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [chargeId, setChargeId] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')

  const refresh = useCallback(async () => {
    try {
      const result = await getTenantSubscription(tenantId)
      setSubscription(result.subscription)
      setWallet(result.wallet)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }, [tenantId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleAdjust() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      // Entered in dollars; the API takes whole cents.
      const cents = Math.round(Number(adjustAmount) * 100)
      const result = await adjustTenantWallet(tenantId, {
        amountCents: cents,
        reason: adjustReason.trim(),
      })
      setWallet(result.wallet)
      setAdjustAmount('')
      setAdjustReason('')
      setNotice(`Wallet adjusted by ${money(cents)}.`)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRefund() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await refundTenantCharge(tenantId, {
        chargeId: chargeId.trim(),
        amountCents: refundAmount
          ? Math.round(Number(refundAmount) * 100)
          : undefined,
        reason: refundReason.trim(),
      })
      setChargeId('')
      setRefundAmount('')
      setRefundReason('')
      setNotice(`Refunded ${money(result.amountCents)} (${result.refundId}).`)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const plan = subscription ? PLAN_CATALOG[subscription.band] : null

  return (
    <Card>
      <CardHeader
        title="Billing support"
        subheader="Owner-only. Every action here is written to the tenant's audit trail."
        action={
          subscription && (
            <Chip
              label={subscription.status ?? 'no subscription'}
              size="small"
              color={subscription.status === 'active' ? 'success' : 'default'}
            />
          )
        }
      />
      <CardContent>
        <Stack spacing={2.5}>
          {error && <Alert severity="error">{error}</Alert>}
          {notice && <Alert severity="success">{notice}</Alert>}

          {subscription && plan && wallet && (
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={3}
              divider={<Divider orientation="vertical" flexItem />}
            >
              <Stack>
                <Typography variant="caption" color="text.secondary">
                  Plan
                </Typography>
                <Typography>
                  {plan.name}
                  {subscription.cancelAtPeriodEnd ? ' (cancelling)' : ''}
                </Typography>
              </Stack>
              <Stack>
                <Typography variant="caption" color="text.secondary">
                  Period minutes
                </Typography>
                <Typography>
                  {subscription.includedMinutesUsed} / {plan.includedMinutes}
                </Typography>
              </Stack>
              <Stack>
                <Typography variant="caption" color="text.secondary">
                  Wallet
                </Typography>
                <Typography>{money(wallet.balanceCents)}</Typography>
              </Stack>
            </Stack>
          )}

          <Divider textAlign="left">
            <Typography variant="body2" color="text.secondary">
              Adjust wallet
            </Typography>
          </Divider>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Amount (USD)"
              type="number"
              size="small"
              value={adjustAmount}
              onChange={event => setAdjustAmount(event.target.value)}
              helperText="Negative claws credit back"
              sx={{ width: 180 }}
            />
            <TextField
              label="Reason"
              size="small"
              value={adjustReason}
              onChange={event => setAdjustReason(event.target.value)}
              fullWidth
            />
            <Button
              variant="outlined"
              onClick={() => void handleAdjust()}
              disabled={
                busy || !Number(adjustAmount) || adjustReason.trim().length < 3
              }
            >
              Apply
            </Button>
          </Stack>

          <Divider textAlign="left">
            <Typography variant="body2" color="text.secondary">
              Refund a charge
            </Typography>
          </Divider>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Stripe charge id"
                size="small"
                value={chargeId}
                onChange={event => setChargeId(event.target.value)}
                helperText="ch_… from the Stripe dashboard"
                fullWidth
              />
              <TextField
                label="Amount (USD)"
                type="number"
                size="small"
                value={refundAmount}
                onChange={event => setRefundAmount(event.target.value)}
                helperText="Blank refunds in full"
                sx={{ width: 180 }}
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Reason"
                size="small"
                value={refundReason}
                onChange={event => setRefundReason(event.target.value)}
                fullWidth
              />
              <Button
                variant="outlined"
                color="warning"
                onClick={() => void handleRefund()}
                disabled={
                  busy || !chargeId.trim() || refundReason.trim().length < 3
                }
              >
                Refund
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Refunding the card does not claw back wallet credit they may
              already have spent — use the wallet adjustment above if you want
              both.
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}
