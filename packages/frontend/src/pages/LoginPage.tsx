import { FormEvent, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { useAuth } from '../app/useAuth'

export function LoginPage() {
  const {
    login,
    completeMfaLogin,
    localEnabled,
    providers,
    selfRegistrationEnabled,
    ssoError,
  } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')

  function goToApp() {
    const from = (location.state as { from?: string } | null)?.from
    navigate(from && from !== '/login' ? from : '/calls', { replace: true })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const challenge = await login(email.trim(), password)
      if (challenge) {
        setChallengeToken(challenge)
        setPassword('')
        return
      }
      goToApp()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await completeMfaLogin(challengeToken!, mfaCode.trim())
      goToApp()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  // Second factor owed: replace the whole form so there is one obvious action.
  if (challengeToken) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 2,
        }}
      >
        <Card sx={{ width: '100%', maxWidth: 400 }}>
          <CardContent>
            <Stack component="form" spacing={2} onSubmit={handleMfaSubmit}>
              <Typography component="h1" variant="h4" fontWeight={700}>
                Two-factor code
              </Typography>
              <Typography color="text.secondary">
                Enter the 6-digit code from your authenticator app, or one of
                your recovery codes.
              </Typography>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                label="Code"
                value={mfaCode}
                onChange={event => setMfaCode(event.target.value)}
                autoComplete="one-time-code"
                autoFocus
                required
                fullWidth
              />
              <Button
                type="submit"
                variant="contained"
                disabled={!mfaCode.trim() || submitting}
              >
                {submitting ? 'Verifying…' : 'Verify'}
              </Button>
              <Button
                variant="text"
                onClick={() => {
                  setChallengeToken(null)
                  setMfaCode('')
                  setError(null)
                }}
              >
                Back to sign in
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 400 }}>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h1" variant="h4" fontWeight={700}>
              ComFlow
            </Typography>
            <Typography color="text.secondary">
              Sign in to your voicemail console.
            </Typography>
            {ssoError && <Alert severity="error">{ssoError}</Alert>}

            {providers.length > 0 && (
              <Stack spacing={1}>
                {providers.map(provider => (
                  <Button
                    key={provider.id}
                    variant="contained"
                    fullWidth
                    href={`/api/auth/sso/${provider.id}/start`}
                  >
                    {provider.label}
                  </Button>
                ))}
              </Stack>
            )}

            {providers.length > 0 && localEnabled && (
              <Divider sx={{ color: 'text.secondary' }}>or</Divider>
            )}

            {localEnabled && (
              <Stack component="form" spacing={2} onSubmit={handleSubmit}>
                {error && <Alert severity="error">{error}</Alert>}
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                  fullWidth
                />
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  fullWidth
                />
                <Button
                  type="submit"
                  variant={providers.length > 0 ? 'outlined' : 'contained'}
                  disabled={!email.trim() || !password || submitting}
                >
                  {submitting ? 'Signing in…' : 'Sign in'}
                </Button>
                <Button
                  component={RouterLink}
                  to="/forgot-password"
                  variant="text"
                  size="small"
                >
                  Forgot your password?
                </Button>
              </Stack>
            )}

            {selfRegistrationEnabled && (
              <Button component={RouterLink} to="/register" variant="text">
                New to ComFlow? Create an account
              </Button>
            )}

            {!localEnabled && providers.length === 0 && (
              <Alert severity="warning">
                No sign-in methods are configured. Set up local accounts or an SSO
                provider.
              </Alert>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
