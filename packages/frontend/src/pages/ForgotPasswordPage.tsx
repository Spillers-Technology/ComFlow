import { FormEvent, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { forgotPassword } from '../lib/api'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await forgotPassword(email.trim())
      setSent(true)
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
            <Typography component="h1" variant="h4" fontWeight={700}>
              Reset your password
            </Typography>
            {sent ? (
              <>
                {/* Deliberately the same message whether or not the address has
                    an account — the endpoint does not reveal which. */}
                <Alert severity="success">
                  If that address has a ComFlow account, a reset link is on its
                  way. The link expires shortly, so use it soon.
                </Alert>
                <Button component={RouterLink} to="/login" variant="contained">
                  Back to sign in
                </Button>
              </>
            ) : (
              <Stack component="form" spacing={2} onSubmit={handleSubmit}>
                <Typography color="text.secondary">
                  Enter your email address and we'll send you a link to set a new
                  password.
                </Typography>
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
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!email.trim() || submitting}
                >
                  {submitting ? 'Sending…' : 'Send reset link'}
                </Button>
                <Button component={RouterLink} to="/login" variant="text">
                  Back to sign in
                </Button>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
