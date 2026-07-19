import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useAuth } from '../app/useAuth'

export function VerifyEmailPage() {
  const { user, verifyEmail } = useAuth()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Confirming your email address…')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const token = searchParams.get('token')?.trim()
    if (!token) {
      setStatus('error')
      setMessage('This verification link is missing its token.')
      return
    }

    void verifyEmail(token)
      .then(() => {
        setStatus('success')
        setMessage('Your email address is verified. Billing and phone setup are unlocked.')
      })
      .catch(reason => {
        setStatus('error')
        setMessage((reason as Error).message)
      })
  }, [searchParams, verifyEmail])

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
      <Card sx={{ width: '100%', maxWidth: 500 }}>
        <CardContent>
          <Stack spacing={2.5} alignItems="stretch">
            <Typography component="h1" variant="h4" fontWeight={700}>
              Verify your email
            </Typography>
            {status === 'loading' ? (
              <Stack direction="row" spacing={2} alignItems="center" role="status">
                <CircularProgress size={24} />
                <Typography>{message}</Typography>
              </Stack>
            ) : (
              <Alert severity={status === 'success' ? 'success' : 'error'}>
                {message}
              </Alert>
            )}
            {status === 'success' && user ? (
              <Button component={RouterLink} to="/onboarding" variant="contained">
                Continue setup
              </Button>
            ) : status !== 'loading' ? (
              <Button component={RouterLink} to="/login" variant="contained">
                Go to sign in
              </Button>
            ) : null}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
