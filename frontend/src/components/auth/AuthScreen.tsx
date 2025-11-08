import { useState } from 'react'
import {
  Card,
  CardHeader,
  CardContent,
  Container,
  Stack,
  TextField,
  Button,
  Typography,
  LinearProgress,
} from '@mui/material'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'

interface AuthScreenProps {
  onLogin: () => void
  onCreateAccount: () => void
}

export function AuthScreen({ onLogin, onCreateAccount }: AuthScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validate = () => {
    if (!email || !password) {
      setError('Enter email and password to continue.')
      return false
    }
    setError(null)
    return true
  }

  const handle = (mode: 'login' | 'create') => {
    if (!validate()) return
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      if (mode === 'login') onLogin()
      else onCreateAccount()
    }, 600)
  }

  return (
    <Container
      maxWidth="sm"
      sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}
    >
      <Card sx={{ width: '100%', p: 3 }}>
        <CardHeader
          title="Welcome to Comflow"
          subheader="AI voicemail & call automation without the panic."
        />
        <CardContent>
          <Stack spacing={2}>
            <TextField
              label="Email"
              type="email"
              fullWidth
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <TextField
              label="Password"
              type="password"
              fullWidth
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />

            {error && (
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ color: 'error.main' }}
              >
                <ErrorOutlineIcon fontSize="small" />
                <Typography variant="body2">{error}</Typography>
              </Stack>
            )}

            {loading && <LinearProgress />}

            <Stack direction="row" spacing={1}>
              <Button
                fullWidth
                variant="outlined"
                disabled={loading}
                onClick={() => handle('login')}
              >
                Log in
              </Button>
              <Button
                fullWidth
                variant="contained"
                endIcon={<ArrowForwardIcon />}
                disabled={loading}
                onClick={() => handle('create')}
              >
                Create account & start setup
              </Button>
            </Stack>

            <Typography variant="caption" color="text.secondary">
              No real account is created yet. This is a guided demo flow; real auth plugs
              into these buttons later.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  )
}
