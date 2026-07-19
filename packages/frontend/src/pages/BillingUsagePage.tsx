import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Container,
  Divider,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { UsageSummary, Wallet } from '../../../shared/src/index.js'
import { useAuth } from '../app/useAuth'
import { getUsage, getWallet, startTopUp } from '../lib/api'

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

const USAGE_LABELS: Record<string, string> = {
  inbound_minute: 'Inbound minutes',
  outbound_minute: 'Outbound minutes',
  did_rental: 'DID rental',
  stt: 'Transcription (STT)',
  llm: 'Extraction (LLM)',
  tts: 'Speech (TTS)',
}

export function BillingUsagePage() {
  const { user, authRequired } = useAuth()
  const [searchParams] = useSearchParams()
  const isAdmin =
    !authRequired || user?.role === 'admin' || user?.role === 'owner'
  const verified = user?.emailVerified !== false
  const checkoutStatus = searchParams.get('status')

  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [amount, setAmount] = useState('20')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toppingUp, setToppingUp] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [walletResult, usageResult] = await Promise.all([
        getWallet(),
        getUsage(),
      ])
      setWallet(walletResult.wallet)
      setSummary(usageResult.summary)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleTopUp() {
    setError(null)
    setToppingUp(true)
    try {
      const cents = Math.round(Number(amount) * 100)
      const { checkoutUrl } = await startTopUp(cents)
      // Stripe Checkout (or the fake provider's URL) — send the browser to pay.
      window.location.assign(checkoutUrl)
    } catch (reason) {
      setError((reason as Error).message)
      setToppingUp(false)
    }
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Billing &amp; usage
          </Typography>
          <Typography color="text.secondary">
            Your prepaid wallet and this month&apos;s metered usage. Charges are
            the raw carrier/AI cost plus your plan markup.
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
        {checkoutStatus === 'success' && (
          <Alert
            severity="success"
            action={
              <Button component={RouterLink} to="/onboarding" color="inherit">
                Continue setup
              </Button>
            }
          >
            Payment submitted. Your wallet updates after the provider confirms
            the settled funds.
          </Alert>
        )}
        {checkoutStatus === 'cancel' && (
          <Alert severity="info">Checkout was canceled; your wallet was not changed.</Alert>
        )}
        {loading && <LinearProgress />}

        {wallet && (
          <Card>
            <CardHeader title="Wallet" />
            <CardContent>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={4}
                divider={<Divider orientation="vertical" flexItem />}
              >
                <Metric label="Balance" value={money(wallet.balanceCents)} big />
                <Metric label="Credited" value={money(wallet.creditCents)} />
                <Metric label="Used" value={money(wallet.billedCents)} />
              </Stack>
              {wallet.balanceCents <= 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Balance exhausted — add funds to keep provisioning and placing
                  calls.
                </Alert>
              )}
              {isAdmin && (
                <Stack spacing={2} sx={{ mt: 3 }}>
                  {!verified && (
                    <Alert severity="warning">
                      Verify your email address before adding funds.
                    </Alert>
                  )}
                  <Stack direction="row" spacing={2} alignItems="center">
                    <TextField
                      label="Amount (USD)"
                      size="small"
                      type="number"
                      value={amount}
                      onChange={event => setAmount(event.target.value)}
                      sx={{ width: 160 }}
                    />
                    <Button
                      variant="contained"
                      onClick={() => void handleTopUp()}
                      disabled={!verified || toppingUp || Number(amount) < 5}
                    >
                      {toppingUp ? 'Redirecting…' : 'Add funds'}
                    </Button>
                  </Stack>
                </Stack>
              )}
            </CardContent>
          </Card>
        )}

        {summary && (
          <Card>
            <CardHeader
              title={`Usage — ${summary.month}`}
              subheader="Carrier/AI cost vs. what you're charged."
            />
            <CardContent>
              {summary.lines.length === 0 ? (
                <Typography color="text.secondary">
                  No usage recorded yet this month.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Item</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Carrier cost</TableCell>
                      <TableCell align="right">Charged</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary.lines.map(line => (
                      <TableRow key={line.type}>
                        <TableCell>
                          {USAGE_LABELS[line.type] ?? line.type}
                        </TableCell>
                        <TableCell align="right">
                          {Math.round(line.quantity * 100) / 100}
                        </TableCell>
                        <TableCell align="right">
                          {money(line.carrierCents)}
                        </TableCell>
                        <TableCell align="right">
                          {money(line.billedCents)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                      <TableCell />
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {money(summary.totalCarrierCents)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {money(summary.totalBilledCents)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 2 }}
              >
                Plan: up to {summary.limits.maxDids} DID(s),{' '}
                {summary.limits.maxConcurrentCalls} concurrent calls,{' '}
                {summary.limits.includedMinutes} included minutes ·{' '}
                {(summary.limits.markupBps / 10000).toFixed(2)}× markup.
              </Typography>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  )
}

function Metric({
  label,
  value,
  big,
}: {
  label: string
  value: string
  big?: boolean
}) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant={big ? 'h4' : 'h6'} fontWeight={700}>
        {value}
      </Typography>
    </Box>
  )
}
