import { FormEvent, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Container,
  Divider,
  MenuItem,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Tenant, TenantLimits } from '../../../shared/src/index.js'
import { useAuth } from '../app/useAuth'
import {
  createTenant,
  createTenantUser,
  getTenantLimits,
  getTenants,
  updateTenant,
  updateTenantLimits,
} from '../lib/api'
import { TenantSupportCard } from '../components/TenantSupportCard'

export function TenantsPage() {
  const { user, authRequired } = useAuth()
  const isOwner = !authRequired || user?.role === 'owner'

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Onboarding form.
  const [name, setName] = useState('')
  const [plan, setPlan] = useState('team')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [maxDids, setMaxDids] = useState('1')
  const [maxConcurrent, setMaxConcurrent] = useState('3')
  const [includedMinutes, setIncludedMinutes] = useState('0')
  const [markup, setMarkup] = useState('1.5')
  const [creating, setCreating] = useState(false)

  // Limits editor.
  const [selectedId, setSelectedId] = useState('')
  const [limits, setLimits] = useState<TenantLimits | null>(null)

  async function loadTenants() {
    const result = await getTenants()
    setTenants(result.items)
    return result.items
  }

  useEffect(() => {
    if (!isOwner) return
    void loadTenants().catch(reason => setError((reason as Error).message))
  }, [isOwner])

  async function selectTenant(id: string) {
    setSelectedId(id)
    setNotice(null)
    if (!id) {
      setLimits(null)
      return
    }
    try {
      const result = await getTenantLimits(id)
      setLimits(result.limits)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  async function handleOnboard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setError(null)
    setNotice(null)
    try {
      const { tenant } = await createTenant({ name: name.trim(), plan })
      await updateTenantLimits(tenant.id, {
        maxDids: Number(maxDids),
        maxConcurrentCalls: Number(maxConcurrent),
        includedMinutes: Number(includedMinutes),
        markupBps: Math.round(Number(markup) * 10000),
      })
      if (adminEmail.trim() && adminPassword) {
        await createTenantUser(tenant.id, {
          email: adminEmail.trim(),
          password: adminPassword,
          role: 'admin',
          displayName: null,
        })
      }
      setName('')
      setAdminEmail('')
      setAdminPassword('')
      await loadTenants()
      setNotice(`Onboarded ${tenant.name}.`)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function handleSaveLimits() {
    if (!selectedId || !limits) return
    setError(null)
    setNotice(null)
    try {
      const result = await updateTenantLimits(selectedId, {
        maxDids: limits.maxDids,
        maxConcurrentCalls: limits.maxConcurrentCalls,
        includedMinutes: limits.includedMinutes,
        markupBps: limits.markupBps,
        outboundEnabled: limits.outboundEnabled,
      })
      setLimits(result.limits)
      setNotice('Plan limits saved.')
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  async function toggleStatus(tenant: Tenant) {
    setError(null)
    try {
      await updateTenant(tenant.id, {
        status: tenant.status === 'active' ? 'suspended' : 'active',
      })
      await loadTenants()
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  if (!isOwner) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="info">Tenant management is owner-only.</Alert>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Tenants
          </Typography>
          <Typography color="text.secondary">
            Onboard customer organizations and set their plan limits. Each tenant
            is fully isolated.
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}

        <Card>
          <CardHeader
            title="Onboard a tenant"
            subheader="Creates the tenant, its plan limits, and (optionally) its first org-admin."
          />
          <CardContent>
            <Stack component="form" spacing={2} onSubmit={handleOnboard}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Name"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Plan"
                  value={plan}
                  onChange={event => setPlan(event.target.value)}
                  sx={{ minWidth: 140 }}
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Org-admin email"
                  type="email"
                  value={adminEmail}
                  onChange={event => setAdminEmail(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Org-admin password"
                  type="password"
                  value={adminPassword}
                  onChange={event => setAdminPassword(event.target.value)}
                  fullWidth
                />
              </Stack>
              <Divider textAlign="left">
                <Typography variant="body2" color="text.secondary">
                  Plan limits
                </Typography>
              </Divider>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Max DIDs"
                  type="number"
                  value={maxDids}
                  onChange={event => setMaxDids(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Max concurrent"
                  type="number"
                  value={maxConcurrent}
                  onChange={event => setMaxConcurrent(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Included minutes"
                  type="number"
                  value={includedMinutes}
                  onChange={event => setIncludedMinutes(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Markup (×)"
                  type="number"
                  value={markup}
                  onChange={event => setMarkup(event.target.value)}
                  fullWidth
                />
              </Stack>
              <Button
                type="submit"
                variant="contained"
                disabled={creating || !name.trim()}
                sx={{ alignSelf: 'flex-start' }}
              >
                {creating ? 'Onboarding…' : 'Onboard tenant'}
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Tenants" />
          <CardContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Slug</TableCell>
                  <TableCell>Plan</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tenants.map(tenant => (
                  <TableRow key={tenant.id}>
                    <TableCell>{tenant.name}</TableCell>
                    <TableCell>{tenant.slug}</TableCell>
                    <TableCell>{tenant.plan}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={tenant.status}
                        color={tenant.status === 'active' ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => void selectTenant(tenant.id)}>
                        Limits
                      </Button>
                      <Button size="small" onClick={() => void toggleStatus(tenant)}>
                        {tenant.status === 'active' ? 'Suspend' : 'Activate'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {limits && (
          <Card>
            <CardHeader
              title="Edit plan limits"
              subheader={tenants.find(t => t.id === selectedId)?.name ?? ''}
            />
            <CardContent>
              <Stack spacing={2}>
                <TextField
                  select
                  label="Tenant"
                  value={selectedId}
                  onChange={event => void selectTenant(event.target.value)}
                >
                  {tenants.map(tenant => (
                    <MenuItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </MenuItem>
                  ))}
                </TextField>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    label="Max DIDs"
                    type="number"
                    value={limits.maxDids}
                    onChange={event =>
                      setLimits({ ...limits, maxDids: Number(event.target.value) })
                    }
                    fullWidth
                  />
                  <TextField
                    label="Max concurrent"
                    type="number"
                    value={limits.maxConcurrentCalls}
                    onChange={event =>
                      setLimits({
                        ...limits,
                        maxConcurrentCalls: Number(event.target.value),
                      })
                    }
                    fullWidth
                  />
                  <TextField
                    label="Included minutes"
                    type="number"
                    value={limits.includedMinutes}
                    onChange={event =>
                      setLimits({
                        ...limits,
                        includedMinutes: Number(event.target.value),
                      })
                    }
                    fullWidth
                  />
                  <TextField
                    label="Markup (bps)"
                    type="number"
                    value={limits.markupBps}
                    onChange={event =>
                      setLimits({ ...limits, markupBps: Number(event.target.value) })
                    }
                    fullWidth
                  />
                </Stack>
                {/* Not part of any plan band — this is the switch you flip
                    after the approval call, and it survives plan changes. */}
                <FormControlLabel
                  control={
                    <Switch
                      checked={limits.outboundEnabled}
                      onChange={event =>
                        setLimits({
                          ...limits,
                          outboundEnabled: event.target.checked,
                        })
                      }
                    />
                  }
                  label="Outbound calling enabled"
                />
                <Button
                  variant="contained"
                  onClick={() => void handleSaveLimits()}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Save limits
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}

        {selectedId && <TenantSupportCard tenantId={selectedId} />}
      </Stack>
    </Container>
  )
}
