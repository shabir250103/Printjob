import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Card, Chip, CircularProgress, MenuItem, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import { api, apiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { permissionModules } from '../config/modules'

interface UserOption {
  id: number
  username: string
  full_name: string
  is_superuser: boolean
  is_active: boolean
  has_profile: boolean
  profile_active: boolean | null
  role_name: string | null
  role_active: boolean | null
  role_defaults: Record<string, boolean> | null
}

interface PermissionOverride {
  id: number
  user: number
  module: string
  access: 'default' | 'allow' | 'deny'
}

type Access = PermissionOverride['access']

function effectiveAccess(user: UserOption, module: string, access: Access): boolean {
  if (!user.is_active) return false
  if (user.is_superuser) return true
  if (!user.has_profile || !user.profile_active || user.role_active === false) return false
  if (access !== 'default') return access === 'allow'
  return user.role_name ? user.role_defaults?.[module] === true : false
}

export function PermissionsPage({ embedded = false }: { embedded?: boolean }) {
  const queryClient = useQueryClient()
  const { refresh } = useAuth()
  const [userId, setUserId] = useState<number | ''>('')
  const [saveError, setSaveError] = useState('')
  const [savingModule, setSavingModule] = useState('')

  const users = useQuery({
    queryKey: ['permission-user-options'],
    queryFn: async () => (await api.get<UserOption[]>('/permission-overrides/user-options/')).data,
  })
  const overrides = useQuery({
    queryKey: ['permission-overrides', userId],
    enabled: Boolean(userId),
    queryFn: async () => (await api.get<PermissionOverride[]>('/permission-overrides/', { params: { user: userId } })).data,
  })
  const selectedUser = users.data?.find((user) => user.id === userId)

  const save = useMutation({
    mutationFn: async ({ module, access, existing }: { module: string; access: Access; existing?: PermissionOverride }) => {
      if (!userId) throw new Error('Select a user first.')
      if (existing) return (await api.patch(`/permission-overrides/${existing.id}/`, { access })).data
      return (await api.post('/permission-overrides/', { user: userId, module, access })).data
    },
    onMutate: ({ module }) => { setSavingModule(module); setSaveError('') },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['permission-overrides', userId] }), refresh()])
    },
    onError: (error) => setSaveError(apiError(error)),
    onSettled: () => setSavingModule(''),
  })

  return <>
    {!embedded && <PageHeader title="Permissions" description="Set an individual user's access when it needs to differ from their role. Job Board also requires In Jobs or Out Jobs access." />}
    <Card sx={{ p: 2.5, mb: 2 }}>
      {users.isError && <Alert severity="error" sx={{ mb: 2 }}>{apiError(users.error)}</Alert>}
      <TextField select label="Select staff member" value={userId} onChange={(event) => { setUserId(Number(event.target.value) || ''); setSaveError('') }} sx={{ minWidth: { xs: '100%', sm: 340 } }} disabled={users.isLoading || users.isError}>
        <MenuItem value=""><em>Choose a user</em></MenuItem>
        {users.data?.map((user) => <MenuItem key={user.id} value={user.id}>{user.full_name ? `${user.full_name} (${user.username})` : user.username}</MenuItem>)}
      </TextField>
      {selectedUser && <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mt: 2 }}>
        <Chip size="small" label={selectedUser.role_name || (selectedUser.is_superuser ? 'Superuser' : 'No role')} variant="outlined" />
        {!selectedUser.is_active || selectedUser.profile_active === false ? <Chip size="small" label="Inactive" color="warning" variant="outlined" /> : null}
        <Typography color="text.secondary" fontSize={12.5}>Role defaults apply unless an override is set.</Typography>
      </Box>}
    </Card>
    {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
    {selectedUser?.is_superuser && <Alert severity="info" sx={{ mb: 2 }}>Superusers always have access to every module. Overrides cannot restrict them.</Alert>}
    {selectedUser && !selectedUser.has_profile && <Alert severity="info" sx={{ mb: 2 }}>This account has no module access. Assign a profile and role on the Users screen.</Alert>}
    {selectedUser && <Card>
      {overrides.isLoading ? <Box sx={{ minHeight: 260, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box> : overrides.isError ? <Alert severity="error" sx={{ m: 2 }}>{apiError(overrides.error)}</Alert> : <TableContainer><Table sx={{ minWidth: 640 }}>
        <TableHead><TableRow><TableCell>Module / screen</TableCell><TableCell>Role default</TableCell><TableCell>Override</TableCell><TableCell>Effective access</TableCell></TableRow></TableHead>
        <TableBody>{permissionModules.map(({ key, label }) => {
          const existing = overrides.data?.find((item) => item.module === key)
          const access = existing?.access || 'default'
          const roleAllowed = selectedUser.role_active === true && selectedUser.role_defaults?.[key] === true
          const allowed = effectiveAccess(selectedUser, key, access)
          return <TableRow key={key} hover>
            <TableCell sx={{ fontWeight: 700 }}>{label}</TableCell>
            <TableCell><Chip size="small" label={roleAllowed ? 'Allow' : 'Deny'} color={roleAllowed ? 'success' : 'default'} variant="outlined" /></TableCell>
            <TableCell>
              <TextField select size="small" value={access} onChange={(event) => save.mutate({ module: key, access: event.target.value as Access, existing })} disabled={save.isPending || selectedUser.is_superuser || !selectedUser.has_profile} sx={{ minWidth: 150 }} aria-label={`${label} override`}>
                <MenuItem value="default">Role default</MenuItem><MenuItem value="allow">Allow</MenuItem><MenuItem value="deny">Deny</MenuItem>
              </TextField>
              {savingModule === key && <CircularProgress size={16} sx={{ ml: 1.5 }} />}
            </TableCell>
            <TableCell><Chip size="small" label={allowed ? 'Visible' : 'Hidden'} color={allowed ? 'success' : 'default'} /></TableCell>
          </TableRow>
        })}</TableBody>
      </Table></TableContainer>}
    </Card>}
  </>
}
