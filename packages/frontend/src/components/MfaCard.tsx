import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { QRCodeSVG } from 'qrcode.react'
import { MfaStatus } from '../../../shared/src/index.js'
import {
  beginMfaEnrollment,
  confirmMfaEnrollment,
  disableMfa,
  getMfaStatus,
} from '../lib/api'

/**
 * Two-factor setup for local accounts. Enrollment is deliberately two-step —
 * scanning a QR code does not switch MFA on until a live code proves the
 * authenticator works, so a misconfigured app cannot lock the user out.
 */
export function MfaCard({ isLocalAccount }: { isLocalAccount: boolean }) {
  const [status, setStatus] = useState<MfaStatus | null>(null)
  const [enrollment, setEnrollment] = useState<{
    secret: string
    otpauthUri: string
  } | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [disablePassword, setDisablePassword] = useState('')
  const [disabling, setDisabling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setStatus(await getMfaStatus())
    } catch (reason) {
      setError((reason as Error).message)
    }
  }, [])

  useEffect(() => {
    if (isLocalAccount) void refresh()
  }, [isLocalAccount, refresh])

  if (!isLocalAccount) {
    return (
      <Card>
        <CardHeader title="Two-factor authentication" />
        <CardContent>
          <Typography color="text.secondary">
            Your identity provider manages two-factor authentication for this
            account.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  async function handleBegin() {
    setBusy(true)
    setError(null)
    try {
      setEnrollment(await beginMfaEnrollment())
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      const result = await confirmMfaEnrollment(code.trim())
      setRecoveryCodes(result.recoveryCodes)
      setEnrollment(null)
      setCode('')
      await refresh()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    setBusy(true)
    setError(null)
    try {
      await disableMfa(disablePassword)
      setDisablePassword('')
      setDisabling(false)
      setRecoveryCodes(null)
      await refresh()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Two-factor authentication"
        subheader="Require a code from your authenticator app at sign-in."
        action={
          status?.enabled ? (
            <Chip label="On" color="success" size="small" />
          ) : (
            <Chip label="Off" size="small" />
          )
        }
      />
      <CardContent>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}

          {recoveryCodes && (
            <Alert severity="warning">
              <Typography fontWeight={600} gutterBottom>
                Save your recovery codes now — they are shown only once.
              </Typography>
              <Typography variant="body2" gutterBottom>
                Each code works once if you lose your authenticator.
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  mt: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.9rem',
                  lineHeight: 1.8,
                }}
              >
                {recoveryCodes.join('\n')}
              </Box>
            </Alert>
          )}

          {enrollment && (
            <Stack spacing={2}>
              <Typography>
                Scan this with your authenticator app, then enter the 6-digit
                code it shows to finish.
              </Typography>
              <Box sx={{ p: 2, bgcolor: 'common.white', alignSelf: 'start' }}>
                <QRCodeSVG value={enrollment.otpauthUri} size={180} />
              </Box>
              <Typography variant="body2" color="text.secondary">
                Can't scan? Enter this key manually:
              </Typography>
              <Box
                component="code"
                sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
              >
                {enrollment.secret}
              </Box>
              <TextField
                label="6-digit code"
                value={code}
                onChange={event => setCode(event.target.value)}
                autoComplete="one-time-code"
                sx={{ maxWidth: 220 }}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  onClick={() => void handleConfirm()}
                  disabled={code.trim().length < 6 || busy}
                >
                  {busy ? 'Verifying…' : 'Turn on'}
                </Button>
                <Button
                  onClick={() => {
                    setEnrollment(null)
                    setCode('')
                  }}
                >
                  Cancel
                </Button>
              </Stack>
            </Stack>
          )}

          {!enrollment && status?.enabled && (
            <Stack spacing={2} alignItems="flex-start">
              <Typography color="text.secondary">
                {status.recoveryCodesRemaining} recovery{' '}
                {status.recoveryCodesRemaining === 1 ? 'code' : 'codes'}{' '}
                remaining.
              </Typography>
              {disabling ? (
                <Stack spacing={2} sx={{ width: '100%', maxWidth: 320 }}>
                  <TextField
                    label="Confirm your password"
                    type="password"
                    value={disablePassword}
                    onChange={event => setDisablePassword(event.target.value)}
                    autoComplete="current-password"
                    fullWidth
                  />
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      color="error"
                      onClick={() => void handleDisable()}
                      disabled={!disablePassword || busy}
                    >
                      {busy ? 'Turning off…' : 'Turn off'}
                    </Button>
                    <Button
                      onClick={() => {
                        setDisabling(false)
                        setDisablePassword('')
                      }}
                    >
                      Cancel
                    </Button>
                  </Stack>
                </Stack>
              ) : (
                <Button color="error" onClick={() => setDisabling(true)}>
                  Turn off two-factor authentication
                </Button>
              )}
            </Stack>
          )}

          {!enrollment && status && !status.enabled && (
            <Button
              variant="contained"
              onClick={() => void handleBegin()}
              disabled={busy}
              sx={{ alignSelf: 'flex-start' }}
            >
              {busy ? 'Preparing…' : 'Set up two-factor authentication'}
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
