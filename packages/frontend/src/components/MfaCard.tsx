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

export function MfaCard({ isLocalAccount }: { isLocalAccount: boolean }) {
  const [status, setStatus] = useState<MfaStatus | null>(null)
  const [enrollment, setEnrollment] = useState<{
    secret: string
    otpauthUri: string
  } | null>(null)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
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
            Your identity provider manages two-factor authentication.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  async function handleBegin() {
    setBusy(true)
    setError(null)
    try {
      setEnrollment(await beginMfaEnrollment(password))
      setPassword('')
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
      await disableMfa(password, code.trim())
      setPassword('')
      setCode('')
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
        subheader="Require an authenticator or single-use recovery code at sign-in."
        action={<Chip label={status?.enabled ? 'On' : 'Off'} color={status?.enabled ? 'success' : 'default'} size="small" />}
      />
      <CardContent>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          {recoveryCodes && (
            <Alert severity="warning">
              <Typography fontWeight={600}>Save these codes now. They are shown once.</Typography>
              <Box component="pre" sx={{ m: 0, mt: 1, overflowX: 'auto', fontFamily: 'monospace', lineHeight: 1.8 }}>
                {recoveryCodes.join('\n')}
              </Box>
            </Alert>
          )}

          {enrollment ? (
            <Stack spacing={2}>
              <Typography>Scan the QR code, then confirm one live code.</Typography>
              <Box sx={{ p: 2, bgcolor: 'common.white', alignSelf: 'start' }}>
                <QRCodeSVG value={enrollment.otpauthUri} size={180} />
              </Box>
              <Typography variant="body2" color="text.secondary">Manual key</Typography>
              <Box component="code" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{enrollment.secret}</Box>
              <TextField label="6-digit code" value={code} onChange={event => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" sx={{ maxWidth: 240 }} />
              <Stack direction="row" spacing={1}>
                <Button variant="contained" onClick={() => void handleConfirm()} disabled={!/^\d{6}$/.test(code.trim()) || busy}>
                  {busy ? 'Verifying…' : 'Turn on'}
                </Button>
                <Button onClick={() => { setEnrollment(null); setCode('') }}>Cancel</Button>
              </Stack>
            </Stack>
          ) : status?.enabled ? (
            <Stack spacing={2} alignItems="flex-start">
              <Typography color="text.secondary">
                {status.recoveryCodesRemaining} recovery codes remaining.
              </Typography>
              {disabling ? (
                <Stack spacing={2} sx={{ width: '100%', maxWidth: 360 }}>
                  <TextField label="Current password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" />
                  <TextField label="Authenticator or recovery code" value={code} onChange={event => setCode(event.target.value)} autoComplete="one-time-code" />
                  <Stack direction="row" spacing={1}>
                    <Button color="error" variant="contained" onClick={() => void handleDisable()} disabled={!password || !code.trim() || busy}>Turn off</Button>
                    <Button onClick={() => { setDisabling(false); setPassword(''); setCode('') }}>Cancel</Button>
                  </Stack>
                </Stack>
              ) : (
                <Button color="error" onClick={() => setDisabling(true)}>Turn off two-factor authentication</Button>
              )}
            </Stack>
          ) : (
            <Stack spacing={2} sx={{ maxWidth: 360 }}>
              <Typography color="text.secondary">
                Confirm your current password before creating an enrollment secret.
              </Typography>
              <TextField label="Current password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" />
              <Button variant="contained" onClick={() => void handleBegin()} disabled={!password || busy} sx={{ alignSelf: 'flex-start' }}>
                {busy ? 'Preparing…' : 'Set up two-factor authentication'}
              </Button>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
