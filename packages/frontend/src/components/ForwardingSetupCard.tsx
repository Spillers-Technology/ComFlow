import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  FormControl,
  FormControlLabel,
  FormLabel,
  Link,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import PhoneIcon from '@mui/icons-material/Phone'
import { QRCodeSVG } from 'qrcode.react'
import {
  FORWARDING_CARRIERS,
  ForwardingMode,
  forwardingTelUri,
  renderForwardingCode,
} from '../../../shared/src/index.js'

function copyFallback(value: string): boolean {
  const input = document.createElement('textarea')
  input.value = value
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.append(input)
  input.select()
  const copied = document.execCommand('copy')
  input.remove()
  return copied
}

export function ForwardingSetupCard({ didNumber }: { didNumber: string }) {
  const [carrierId, setCarrierId] = useState('')
  const [mode, setMode] = useState<ForwardingMode>('conditional')
  const [copyNotice, setCopyNotice] = useState<string | null>(null)
  const carrier = FORWARDING_CARRIERS.find(item => item.id === carrierId) ?? null
  const modeLabelId = `forwarding-mode-${didNumber.replace(/[^a-z0-9]/gi, '')}`

  const rendered = useMemo(() => {
    if (!carrier || carrier.setup !== 'dial-codes' || !carrier.numberFormat) {
      return { codes: [], error: null }
    }
    try {
      return {
        codes: carrier.activation
          .filter(code => code.mode === mode)
          .map(code => ({
            ...code,
            dialString: renderForwardingCode(
              code.code,
              didNumber,
              carrier.numberFormat!
            ),
          })),
        error: null,
      }
    } catch (reason) {
      return { codes: [], error: (reason as Error).message }
    }
  }, [carrier, didNumber, mode])

  async function copy(value: string, label: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else if (!copyFallback(value)) {
        throw new Error('Copy is unavailable.')
      }
      setCopyNotice(`${label} copied.`)
    } catch {
      setCopyNotice('Copy was blocked. Select the code and copy it manually.')
    }
  }

  const deactivation =
    carrier?.deactivation.filter(code => code.mode === mode || code.mode === 'all') ??
    []

  return (
    <Card>
      <CardHeader
        title="4. Set up call forwarding"
        subheader={`Send calls from your phone to ${didNumber}`}
      />
      <CardContent>
        <Stack spacing={3}>
          <Alert severity="info">
            Choose the carrier for the phone being forwarded, not the provider of
            your ComFlow number. Carrier support can vary by plan and device.
          </Alert>

          <TextField
            select
            label="Mobile carrier"
            value={carrierId}
            onChange={event => {
              setCarrierId(event.target.value)
              setCopyNotice(null)
            }}
            helperText="Select a carrier before dialing any code."
            fullWidth
          >
            {FORWARDING_CARRIERS.map(item => (
              <MenuItem key={item.id} value={item.id}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>

          <FormControl>
            <FormLabel id={modeLabelId}>Forwarding mode</FormLabel>
            <RadioGroup
              aria-labelledby={modeLabelId}
              value={mode}
              onChange={event => {
                setMode(event.target.value as ForwardingMode)
                setCopyNotice(null)
              }}
            >
              <FormControlLabel
                value="conditional"
                control={<Radio />}
                label={
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <span>Missed calls only</span>
                    <Chip label="Recommended" color="success" size="small" />
                  </Stack>
                }
              />
              <FormControlLabel
                value="unconditional"
                control={<Radio />}
                label="All calls"
              />
            </RadioGroup>
          </FormControl>

          {mode === 'unconditional' && (
            <Alert severity="warning">
              Your phone will stop ringing. Every incoming call will go directly
              to ComFlow until you turn forwarding off.
            </Alert>
          )}

          {carrier && (
            <Alert severity={carrier.setup === 'dial-codes' ? 'info' : 'warning'}>
              {carrier.notes}{' '}
              {carrier.helpUrl && (
                <Link href={carrier.helpUrl} target="_blank" rel="noreferrer">
                  Open carrier instructions
                </Link>
              )}
            </Alert>
          )}

          {rendered.error && <Alert severity="error">{rendered.error}</Alert>}

          {carrier?.setup === 'dial-codes' && rendered.codes.length > 0 && (
            <Stack spacing={3}>
              <Alert severity="warning">
                QR and tap-to-dial are best-effort. iPhone blocks phone links that
                contain * or #. If the dialer does not open with the full code,
                copy the visible code into the Phone app instead.
              </Alert>
              {mode === 'conditional' && rendered.codes.length > 1 && (
                <Typography fontWeight={700}>
                  Dial all {rendered.codes.length} codes below to cover every kind
                  of missed call.
                </Typography>
              )}
              {rendered.codes.map(code => {
                const uri = forwardingTelUri(code.dialString)
                return (
                  <Card key={code.code} variant="outlined">
                    <CardContent>
                      <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={3}
                        alignItems={{ md: 'center' }}
                      >
                        <Box
                          sx={{
                            bgcolor: '#fff',
                            p: 1,
                            lineHeight: 0,
                            alignSelf: { xs: 'center', md: 'flex-start' },
                          }}
                        >
                          <QRCodeSVG
                            value={uri}
                            size={168}
                            level="M"
                            marginSize={4}
                            title={`QR code for ${code.label}: ${code.dialString}`}
                            role="img"
                            aria-label={`Scan to try dialing ${code.dialString}`}
                          />
                        </Box>
                        <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
                          <Box>
                            <Typography variant="h6" component="h3">
                              {code.label}
                            </Typography>
                            <Typography color="text.secondary">
                              {code.description}
                            </Typography>
                          </Box>
                          <Typography
                            component="code"
                            sx={{
                              display: 'block',
                              p: 1.5,
                              borderRadius: 1,
                              bgcolor: 'action.hover',
                              fontFamily: 'monospace',
                              fontSize: '1.05rem',
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {code.dialString}
                          </Typography>
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <Button
                              variant="contained"
                              startIcon={<ContentCopyIcon />}
                              onClick={() => void copy(code.dialString, code.label)}
                              aria-label={`Copy ${code.label} forwarding code`}
                            >
                              Copy code
                            </Button>
                            <Button
                              component="a"
                              href={uri}
                              variant="outlined"
                              startIcon={<PhoneIcon />}
                              aria-label={`Try dialing ${code.label} forwarding code`}
                            >
                              Try on this phone
                            </Button>
                          </Stack>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                )
              })}
            </Stack>
          )}

          {carrier?.setup === 'device-settings' && (
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h6" component="h3">
                    Enter this number in your phone settings
                  </Typography>
                  <Typography component="ol" sx={{ m: 0, pl: 3 }}>
                    <li>Open Phone or Call settings on the carrier device.</li>
                    <li>
                      Choose {mode === 'conditional' ? 'missed/no-answer' : 'all-call'}
                      {' '}forwarding. If missed-call forwarding is unavailable,
                      confirm the supported method with the carrier.
                    </li>
                    <li>Enter the ComFlow number, save, and place a test call.</li>
                  </Typography>
                  <Typography
                    component="code"
                    sx={{
                      display: 'block',
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: 'action.hover',
                      fontFamily: 'monospace',
                      fontSize: '1.05rem',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {didNumber}
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<ContentCopyIcon />}
                    onClick={() => void copy(didNumber, 'ComFlow number')}
                    aria-label="Copy ComFlow forwarding number"
                  >
                    Copy number
                  </Button>
                  <Alert severity="info">
                    To turn forwarding off, return to the same Phone or Call
                    settings and disable the forwarding option.
                  </Alert>
                </Stack>
              </CardContent>
            </Card>
          )}

          {deactivation.length > 0 && (
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography variant="h6" component="h3">
                    How to turn forwarding off
                  </Typography>
                  <Typography color="text.secondary">
                    Keep these carrier codes somewhere convenient.
                  </Typography>
                  {deactivation.map(code => (
                    <Stack
                      key={code.code}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ sm: 'center' }}
                    >
                      <Typography sx={{ flex: 1 }}>
                        {code.label}: <Box component="code">{code.code}</Box>
                      </Typography>
                      <Button
                        size="small"
                        startIcon={<ContentCopyIcon />}
                        onClick={() => void copy(code.code, code.label)}
                        aria-label={`Copy ${code.label} code`}
                      >
                        Copy
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          )}

          {carrier && (
            <Alert severity="success">
              After saving or dialing the code, call your original phone number
              from another line. Confirm that missed calls reach ComFlow before
              relying on the setup.
            </Alert>
          )}

          <Typography aria-live="polite" role="status" variant="body2">
            {copyNotice ?? ''}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  )
}
