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
import { useAuth } from '../app/AuthContext'

export function LoginPage() {
  const { login, localEnabled, providers, ssoError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(email.trim(), password)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setSubmitting(false)
    }
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
            <Typography variant="h4" fontWeight={700}>
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
                  autoFocus
                  fullWidth
                />
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  fullWidth
                />
                <Button
                  type="submit"
                  variant={providers.length > 0 ? 'outlined' : 'contained'}
                  disabled={!email.trim() || !password || submitting}
                >
                  {submitting ? 'Signing in…' : 'Sign in'}
                </Button>
              </Stack>
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
