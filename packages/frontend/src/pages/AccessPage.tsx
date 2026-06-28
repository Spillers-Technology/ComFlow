import { FormEvent, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  OutlinedInput,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import {
  GroupDetail,
  Mailbox,
  SsoGroupMapping,
  User,
  UserRole,
} from '../../../shared/src/index.js'
import { useAuth } from '../app/AuthContext'
import {
  createGroup,
  createUser,
  deleteGroup,
  deleteUser,
  getGroups,
  getMailboxes,
  getSsoGroupMappings,
  getUsers,
  resetUserPassword,
  setGroupMailboxes,
  setGroupMembers,
  setSsoGroupMappings,
  updateUser,
} from '../lib/api'

export function AccessPage() {
  const [groups, setGroups] = useState<GroupDetail[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [mappings, setMappings] = useState<SsoGroupMapping[]>([])
  const [error, setError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const { user: currentUser } = useAuth()

  async function loadAll() {
    const [groupResult, userResult, mailboxResult, mappingResult] =
      await Promise.all([
        getGroups(),
        getUsers(),
        getMailboxes(),
        getSsoGroupMappings(),
      ])
    setGroups(groupResult.items)
    setUsers(userResult.items)
    setMailboxes(mailboxResult.items)
    setMappings(mappingResult.mappings)
  }

  useEffect(() => {
    void loadAll().catch(reason => setError((reason as Error).message))
  }, [])

  function replaceGroup(updated: GroupDetail) {
    setGroups(current =>
      current.map(group => (group.id === updated.id ? updated : group))
    )
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    try {
      const result = await createGroup({
        name: newName.trim(),
        description: newDescription.trim() ? newDescription.trim() : null,
      })
      setGroups(current => [...current, result.group])
      setNewName('')
      setNewDescription('')
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteGroup(id)
      setGroups(current => current.filter(group => group.id !== id))
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  async function handleMembers(id: string, userIds: string[]) {
    try {
      const result = await setGroupMembers(id, userIds)
      replaceGroup(result.group)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  async function handleMailboxes(id: string, mailboxIds: string[]) {
    try {
      const result = await setGroupMailboxes(id, mailboxIds)
      replaceGroup(result.group)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  async function saveMappings(next: SsoGroupMapping[]) {
    setError(null)
    try {
      const result = await setSsoGroupMappings(next)
      setMappings(result.mappings)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  return (
    <Box sx={{ maxWidth: 880, mx: 'auto', p: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Access
          </Typography>
          <Typography color="text.secondary">
            Manage users and the groups that grant mailbox visibility. Admins see
            every mailbox; members see only the mailboxes their groups grant.
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        <UsersCard
          users={users}
          currentUserId={currentUser?.id ?? null}
          onChanged={() => void loadAll()}
          onError={message => setError(message)}
        />

        <Card>
          <CardHeader title="New group" />
          <CardContent>
            <Stack
              component="form"
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              onSubmit={handleCreate}
            >
              <TextField
                label="Name"
                value={newName}
                onChange={event => setNewName(event.target.value)}
                fullWidth
              />
              <TextField
                label="Description"
                value={newDescription}
                onChange={event => setNewDescription(event.target.value)}
                fullWidth
              />
              <Button type="submit" variant="contained" disabled={!newName.trim()}>
                Create
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {groups.map(group => (
          <Card key={group.id}>
            <CardHeader
              title={group.name}
              subheader={group.description ?? undefined}
              action={
                <IconButton
                  aria-label="Delete group"
                  onClick={() => void handleDelete(group.id)}
                >
                  <DeleteIcon />
                </IconButton>
              }
            />
            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Members
                  </Typography>
                  <Select
                    multiple
                    fullWidth
                    size="small"
                    value={group.members.map(member => member.id)}
                    onChange={event =>
                      void handleMembers(
                        group.id,
                        typeof event.target.value === 'string'
                          ? event.target.value.split(',')
                          : event.target.value
                      )
                    }
                    input={<OutlinedInput />}
                    renderValue={selected => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(selected as string[]).map(id => {
                          const member = users.find(user => user.id === id)
                          return (
                            <Chip
                              key={id}
                              size="small"
                              label={member?.email ?? id}
                            />
                          )
                        })}
                      </Box>
                    )}
                  >
                    {users.map(user => (
                      <MenuItem key={user.id} value={user.id}>
                        {user.email}
                        {user.role === 'admin' ? ' (admin)' : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>

                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Mailboxes
                  </Typography>
                  <Select
                    multiple
                    fullWidth
                    size="small"
                    value={group.mailboxes.map(mailbox => mailbox.id)}
                    onChange={event =>
                      void handleMailboxes(
                        group.id,
                        typeof event.target.value === 'string'
                          ? event.target.value.split(',')
                          : event.target.value
                      )
                    }
                    input={<OutlinedInput />}
                    renderValue={selected => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(selected as string[]).map(id => {
                          const mailbox = mailboxes.find(item => item.id === id)
                          return (
                            <Chip
                              key={id}
                              size="small"
                              label={mailbox?.name ?? id}
                            />
                          )
                        })}
                      </Box>
                    )}
                  >
                    {mailboxes.map(mailbox => (
                      <MenuItem key={mailbox.id} value={mailbox.id}>
                        {mailbox.name}
                        {mailbox.number ? ` · ${mailbox.number}` : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        ))}

        <Divider />

        <SsoMappingsCard
          mappings={mappings}
          groups={groups}
          onSave={saveMappings}
        />
      </Stack>
    </Box>
  )
}

function UsersCard({
  users,
  currentUserId,
  onChanged,
  onError,
}: {
  users: User[]
  currentUserId: string | null
  onChanged: () => void
  onError: (message: string) => void
}) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('member')

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await createUser({
        email: email.trim(),
        displayName: displayName.trim() ? displayName.trim() : null,
        password,
        role,
      })
      setEmail('')
      setDisplayName('')
      setPassword('')
      setRole('member')
      onChanged()
    } catch (reason) {
      onError((reason as Error).message)
    }
  }

  async function changeRole(id: string, nextRole: UserRole) {
    try {
      await updateUser(id, { role: nextRole })
      onChanged()
    } catch (reason) {
      onError((reason as Error).message)
    }
  }

  async function handleResetPassword(id: string, email: string) {
    const next = window.prompt(`New password for ${email} (min 8 chars):`)
    if (!next) return
    try {
      await resetUserPassword(id, next)
    } catch (reason) {
      onError((reason as Error).message)
    }
  }

  async function handleDelete(id: string, email: string) {
    if (!window.confirm(`Delete ${email}? This cannot be undone.`)) return
    try {
      await deleteUser(id)
      onChanged()
    } catch (reason) {
      onError((reason as Error).message)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Users"
        subheader="Local accounts. SSO users are provisioned automatically on first login."
      />
      <CardContent>
        <Stack spacing={2}>
          {users.map(user => (
            <Stack
              key={user.id}
              direction="row"
              spacing={1}
              alignItems="center"
              flexWrap="wrap"
            >
              <Box sx={{ minWidth: 200, flex: 1 }}>
                <Typography>{user.email}</Typography>
                {user.displayName && (
                  <Typography variant="body2" color="text.secondary">
                    {user.displayName}
                  </Typography>
                )}
              </Box>
              <Select
                size="small"
                value={user.role}
                onChange={event => changeRole(user.id, event.target.value as UserRole)}
                sx={{ minWidth: 120 }}
              >
                <MenuItem value="admin">admin</MenuItem>
                <MenuItem value="member">member</MenuItem>
              </Select>
              <Chip
                size="small"
                variant="outlined"
                label={user.authProvider}
              />
              <Button size="small" onClick={() => void handleResetPassword(user.id, user.email)}>
                Reset password
              </Button>
              <IconButton
                size="small"
                aria-label="Delete user"
                disabled={user.id === currentUserId}
                onClick={() => void handleDelete(user.id, user.email)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}

          <Divider />

          <Stack
            component="form"
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            onSubmit={handleCreate}
            alignItems={{ sm: 'center' }}
          >
            <TextField
              label="Email"
              type="email"
              size="small"
              value={email}
              onChange={event => setEmail(event.target.value)}
              fullWidth
            />
            <TextField
              label="Display name"
              size="small"
              value={displayName}
              onChange={event => setDisplayName(event.target.value)}
              fullWidth
            />
            <TextField
              label="Temp password"
              type="password"
              size="small"
              value={password}
              onChange={event => setPassword(event.target.value)}
              fullWidth
            />
            <Select
              size="small"
              value={role}
              onChange={event => setRole(event.target.value as UserRole)}
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="member">member</MenuItem>
              <MenuItem value="admin">admin</MenuItem>
            </Select>
            <Button
              type="submit"
              variant="contained"
              disabled={!email.trim() || password.length < 8}
            >
              Add user
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

function SsoMappingsCard({
  mappings,
  groups,
  onSave,
}: {
  mappings: SsoGroupMapping[]
  groups: GroupDetail[]
  onSave: (next: SsoGroupMapping[]) => Promise<void>
}) {
  const [rows, setRows] = useState<SsoGroupMapping[]>(mappings)
  const [externalName, setExternalName] = useState('')
  const [groupId, setGroupId] = useState('')

  useEffect(() => {
    setRows(mappings)
  }, [mappings])

  function addRow() {
    if (!externalName.trim() || !groupId) return
    const next = [
      ...rows.filter(row => row.externalName !== externalName.trim()),
      { externalName: externalName.trim(), groupId },
    ]
    setExternalName('')
    setGroupId('')
    void onSave(next)
  }

  function removeRow(name: string) {
    void onSave(rows.filter(row => row.externalName !== name))
  }

  return (
    <Card>
      <CardHeader
        title="SSO group mappings"
        subheader="Map IdP group names onto ComFlow groups. Members are synced into the mapped group on every SSO login."
      />
      <CardContent>
        <Stack spacing={2}>
          {rows.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              No mappings yet.
            </Typography>
          )}
          {rows.map(row => {
            const group = groups.find(item => item.id === row.groupId)
            return (
              <Stack
                key={row.externalName}
                direction="row"
                spacing={1}
                alignItems="center"
              >
                <Chip label={row.externalName} />
                <Typography color="text.secondary">→</Typography>
                <Chip color="primary" label={group?.name ?? row.groupId} />
                <IconButton
                  size="small"
                  aria-label="Remove mapping"
                  onClick={() => removeRow(row.externalName)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
            )
          })}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="IdP group name"
              size="small"
              value={externalName}
              onChange={event => setExternalName(event.target.value)}
              fullWidth
            />
            <Select
              size="small"
              displayEmpty
              value={groupId}
              onChange={event => setGroupId(event.target.value)}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="" disabled>
                Select group
              </MenuItem>
              {groups.map(group => (
                <MenuItem key={group.id} value={group.id}>
                  {group.name}
                </MenuItem>
              ))}
            </Select>
            <Button
              variant="outlined"
              onClick={addRow}
              disabled={!externalName.trim() || !groupId}
            >
              Add
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}
