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
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { RegisterRequestSchema } from '../../../shared/src/index.js'
import { useAuth } from '../app/useAuth'

type RegisterField =
  | 'displayName'
  | 'organizationName'
  | 'email'
  | 'password'
  | 'confirmPassword'

type FieldErrors = Partial<Record<RegisterField, string>>

export function RegisterPage() {
  const { register, selfRegistrationEnabled } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const input = {
      email: email.trim(),
      password,
      ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      ...(organizationName.trim()
        ? { organizationName: organizationName.trim() }
        : {}),
    }
    const parsed = RegisterRequestSchema.safeParse(input)
    const nextErrors: FieldErrors = {}
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string' && !nextErrors[field as RegisterField]) {
          nextErrors[field as RegisterField] = issue.message
        }
      }
    }
    if (password !== confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.'
    }
    setFieldErrors(nextErrors)
    if (!parsed.success || Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      await register(parsed.data)
      navigate('/onboarding', { replace: true })
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
      <Card sx={{ width: '100%', maxWidth: 520 }}>
        <CardContent>
          <Stack spacing={2.5}>
            <Box>
              <Typography component="h1" variant="h4" fontWeight={700}>
                Create your ComFlow account
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                Set up your team, fund the prepaid wallet, and choose a phone
                number without waiting for an operator.
              </Typography>
            </Box>

            {!selfRegistrationEnabled ? (
              <Alert severity="info">
                Self-registration is not available on this ComFlow deployment.
              </Alert>
            ) : (
              <Stack
                component="form"
                noValidate
                spacing={2}
                onSubmit={handleSubmit}
              >
                {error && <Alert severity="error">{error}</Alert>}
                <TextField
                  label="Your name"
                  value={displayName}
                  onChange={event => setDisplayName(event.target.value)}
                  error={Boolean(fieldErrors.displayName)}
                  helperText={fieldErrors.displayName}
                  autoComplete="name"
                  autoFocus
                  fullWidth
                />
                <TextField
                  label="Organization or team"
                  value={organizationName}
                  onChange={event => setOrganizationName(event.target.value)}
                  error={Boolean(fieldErrors.organizationName)}
                  helperText={
                    fieldErrors.organizationName ??
                    'Optional. We will use your name if this is blank.'
                  }
                  autoComplete="organization"
                  fullWidth
                />
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  error={Boolean(fieldErrors.email)}
                  helperText={fieldErrors.email}
                  autoComplete="email"
                  required
                  fullWidth
                />
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  error={Boolean(fieldErrors.password)}
                  helperText={fieldErrors.password ?? 'Use at least 8 characters.'}
                  autoComplete="new-password"
                  required
                  fullWidth
                />
                <TextField
                  label="Confirm password"
                  type="password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  error={Boolean(fieldErrors.confirmPassword)}
                  helperText={fieldErrors.confirmPassword}
                  autoComplete="new-password"
                  required
                  fullWidth
                />
                <Button type="submit" variant="contained" disabled={submitting}>
                  {submitting ? 'Creating account…' : 'Create account'}
                </Button>
              </Stack>
            )}

            <Button component={RouterLink} to="/login" variant="text">
              Already have an account? Sign in
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
