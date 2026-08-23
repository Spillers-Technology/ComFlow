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
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../lib/api'

const MIN_LENGTH = 8

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const mismatch = confirm.length > 0 && password !== confirm
  const tooShort = password.length > 0 && password.length < MIN_LENGTH

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await resetPassword(token, password)
      setDone(true)
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
              Set a new password
            </Typography>

            {!token ? (
              <>
                <Alert severity="error">
                  This reset link is missing its token. Request a new one.
                </Alert>
                <Button
                  component={RouterLink}
                  to="/forgot-password"
                  variant="contained"
                >
                  Request a new link
                </Button>
              </>
            ) : done ? (
              <>
                <Alert severity="success">
                  Your password is updated, and any other devices that were
                  signed in have been signed out.
                </Alert>
                <Button component={RouterLink} to="/login" variant="contained">
                  Sign in
                </Button>
              </>
            ) : (
              <Stack component="form" spacing={2} onSubmit={handleSubmit}>
                {error && <Alert severity="error">{error}</Alert>}
                <TextField
                  label="New password"
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete="new-password"
                  autoFocus
                  required
                  fullWidth
                  error={tooShort}
                  helperText={
                    tooShort
                      ? `Use at least ${MIN_LENGTH} characters.`
                      : `At least ${MIN_LENGTH} characters.`
                  }
                />
                <TextField
                  label="Confirm new password"
                  type="password"
                  value={confirm}
                  onChange={event => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  required
                  fullWidth
                  error={mismatch}
                  helperText={mismatch ? 'Passwords do not match.' : ' '}
                />
                <Button
                  type="submit"
                  variant="contained"
                  disabled={
                    submitting ||
                    password.length < MIN_LENGTH ||
                    password !== confirm
                  }
                >
                  {submitting ? 'Saving…' : 'Set new password'}
                </Button>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
