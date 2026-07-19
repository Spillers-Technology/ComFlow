import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  Container,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import {
  ProvisionedDid,
  Wallet,
} from '../../../shared/src/index.js'
import { useAuth } from '../app/useAuth'
import { DidManagerCard } from '../components/DidManagerCard'
import { ForwardingSetupCard } from '../components/ForwardingSetupCard'
import {
  getDids,
  getWallet,
  resendVerification,
  startTopUp,
} from '../lib/api'

const STEPS = ['Verify email', 'Fund wallet', 'Choose number', 'Set up forwarding']

export function OnboardingPage() {
  const { user } = useAuth()
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [dids, setDids] = useState<ProvisionedDid[]>([])
  const [amount, setAmount] = useState('20')
  const [loading, setLoading] = useState(true)
  const [toppingUp, setToppingUp] = useState(false)
  const [resending, setResending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [walletResult, didResult] = await Promise.all([getWallet(), getDids()])
      setWallet(walletResult.wallet)
      setDids(didResult.items)
      setError(null)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const activeDids = useMemo(
    () => dids.filter(did => did.status === 'active'),
    [dids]
  )
  const verified = user?.emailVerified !== false
  const funded = Boolean(wallet && wallet.balanceCents > 0)
  const activeStep = !verified ? 0 : !funded ? 1 : activeDids.length === 0 ? 2 : 3

  async function handleTopUp() {
    const cents = Math.round(Number(amount) * 100)
    if (!Number.isFinite(cents) || cents < 500) {
      setError('Enter an amount of at least $5.00.')
      return
    }
    setError(null)
    setToppingUp(true)
    try {
      const { checkoutUrl } = await startTopUp(cents)
      window.location.assign(checkoutUrl)
    } catch (reason) {
      setError((reason as Error).message)
      setToppingUp(false)
    }
  }

  async function handleResendVerification() {
    if (!user?.email) return
    setError(null)
    setNotice(null)
    setResending(true)
    try {
      await resendVerification(user.email)
      setNotice('If the address is eligible, a fresh verification email is on its way.')
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setResending(false)
    }
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography component="h1" variant="h4" fontWeight={700}>
            Set up ComFlow
          </Typography>
          <Typography color="text.secondary">
            Follow these four steps to send missed calls into your voicemail inbox.
          </Typography>
        </Box>

        <Stepper activeStep={activeStep} alternativeLabel>
          {STEPS.map(label => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        {loading && (
          <Stack direction="row" spacing={2} alignItems="center" role="status">
            <CircularProgress size={24} />
            <Typography>Loading your setup…</Typography>
          </Stack>
        )}

        {!loading && !verified && (
          <Card>
            <CardHeader title="1. Verify your email" />
            <CardContent>
              <Stack spacing={2}>
                <Alert severity="warning">
                  We sent a verification link to {user?.email}. Open it before
                  adding funds or provisioning a phone number.
                </Alert>
                <Button
                  variant="outlined"
                  onClick={() => void handleResendVerification()}
                  disabled={resending}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  {resending ? 'Sending…' : 'Send a new verification link'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}

        {!loading && verified && !funded && (
          <Card>
            <CardHeader
              title="2. Fund your wallet"
              subheader="Carrier charges come from a prepaid balance. Funds appear only after payment confirmation."
            />
            <CardContent>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                alignItems={{ sm: 'center' }}
              >
                <TextField
                  label="Amount (USD)"
                  type="number"
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                  inputProps={{ min: 5, step: 1 }}
                  helperText="Minimum $5.00"
                />
                <Button
                  variant="contained"
                  onClick={() => void handleTopUp()}
                  disabled={toppingUp}
                >
                  {toppingUp ? 'Opening checkout…' : 'Add funds'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}

        {!loading && verified && funded && activeDids.length === 0 && (
          <Box>
            <Typography variant="h5" component="h2" fontWeight={700} sx={{ mb: 2 }}>
              3. Choose your ComFlow number
            </Typography>
            <DidManagerCard onChange={() => void load()} />
          </Box>
        )}

        {!loading && verified && funded && activeDids.length > 0 && (
          <Stack spacing={3}>
            <Alert severity="success">
              Your number is ready. Configure the phone that should send calls to
              ComFlow, then place a test call.
            </Alert>
            {activeDids.map(did => (
              <ForwardingSetupCard key={did.id} didNumber={did.number} />
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  )
}
