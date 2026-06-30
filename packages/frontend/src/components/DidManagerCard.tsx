import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { AvailableDid, ProvisionedDid } from '../../../shared/src/index.js'
import { getDids, provisionDid, releaseDid, searchDids } from '../lib/api'

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

/** Search, provision, and release DIDs from the SIP trunk provider. */
export function DidManagerCard({ onChange }: { onChange?: () => void }) {
  const [dids, setDids] = useState<ProvisionedDid[]>([])
  const [available, setAvailable] = useState<AvailableDid[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [mailboxName, setMailboxName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function loadDids() {
    const result = await getDids()
    setDids(result.items)
  }

  useEffect(() => {
    void loadDids().catch(reason => setError((reason as Error).message))
  }, [])

  async function handleSearch() {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const result = await searchDids('US', query.trim() || undefined)
      setAvailable(result.items)
      setSelected(result.items[0]?.number ?? '')
      if (result.items.length === 0) setNotice('No numbers available for that search.')
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleProvision() {
    if (!selected) return
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const { did } = await provisionDid({
        number: selected,
        mailboxName: mailboxName.trim() || undefined,
      })
      setAvailable(current => current.filter(d => d.number !== did.number))
      setSelected('')
      setMailboxName('')
      await loadDids()
      onChange?.()
      setNotice(`Provisioned ${did.number}.`)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRelease(number: string) {
    setError(null)
    setNotice(null)
    try {
      await releaseDid(number)
      await loadDids()
      onChange?.()
      setNotice(`Released ${number}.`)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Phone numbers (DIDs)"
        subheader="Provision a number from the trunk provider and forward your line to it."
      />
      <CardContent>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          {notice && <Alert severity="success">{notice}</Alert>}

          {dids.filter(d => d.status === 'active').length === 0 ? (
            <Typography color="text.secondary">No numbers yet.</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Number</TableCell>
                  <TableCell>Provider</TableCell>
                  <TableCell align="right">Monthly</TableCell>
                  <TableCell align="right">Per min</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {dids
                  .filter(did => did.status === 'active')
                  .map(did => (
                    <TableRow key={did.id}>
                      <TableCell>{did.number}</TableCell>
                      <TableCell>{did.provider}</TableCell>
                      <TableCell align="right">{money(did.monthlyCents)}</TableCell>
                      <TableCell align="right">{money(did.perMinuteCents)}</TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          color="error"
                          onClick={() => void handleRelease(did.number)}
                        >
                          Release
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}

          <Divider />

          <Typography variant="subtitle2">Provision a new number</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Area / state (e.g. NY)"
              size="small"
              value={query}
              onChange={event => setQuery(event.target.value)}
              fullWidth
            />
            <Button variant="outlined" onClick={() => void handleSearch()} disabled={busy}>
              Search
            </Button>
          </Stack>

          {available.length > 0 && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select
                label="Available number"
                size="small"
                value={selected}
                onChange={event => setSelected(event.target.value)}
                fullWidth
              >
                {available.map(did => (
                  <MenuItem key={did.number} value={did.number}>
                    {did.number} · {money(did.monthlyCents)}/mo ·{' '}
                    {money(did.perMinuteCents)}/min
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Mailbox name"
                size="small"
                value={mailboxName}
                onChange={event => setMailboxName(event.target.value)}
                fullWidth
              />
              <Button
                variant="contained"
                onClick={() => void handleProvision()}
                disabled={busy || !selected}
              >
                Provision
              </Button>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
