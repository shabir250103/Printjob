import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, IconButton, Switch,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import EditRounded from '@mui/icons-material/EditRounded'
import { useNavigate } from 'react-router'
import { api, apiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { permissionModules } from '../config/modules'

interface Role {
  id: number
  name: string
  default_permissions: Record<string, boolean>
  is_active: boolean
}

export function RolesPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { refresh } = useAuth()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Role | null>(null)
  const [name, setName] = useState('')
  const [active, setActive] = useState(true)
  const [defaults, setDefaults] = useState<Record<string, boolean>>({})
  const [saveError, setSaveError] = useState('')

  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => (await api.get<Role[]>('/roles/')).data })
  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), is_active: active, default_permissions: defaults }
      return editing
        ? (await api.patch(`/roles/${editing.id}/`, payload)).data
        : (await api.post('/roles/', payload)).data
    },
    onSuccess: async () => {
      setOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roles'] }),
        queryClient.invalidateQueries({ queryKey: ['form-lookups'] }),
        refresh(),
      ])
    },
    onError: (error) => setSaveError(apiError(error)),
  })

  useEffect(() => {
    if (!open) return
    setName(editing?.name || '')
    setActive(editing?.is_active ?? true)
    setDefaults(Object.fromEntries(permissionModules.map(({ key }) => [key, Boolean(editing?.default_permissions[key])])))
    setSaveError('')
  }, [open, editing])

  const openNew = () => navigate('/roles/new')
  const openEdit = (role: Role) => { setEditing(role); setOpen(true) }

  return <>
    {!embedded && <PageHeader title="Roles" description="Set which modules each staff role can open. Individual overrides are managed on the Permissions screen." actionLabel="New role" onAction={openNew} />}
    <Card>
      {roles.isLoading && <Box sx={{ minHeight: 280, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>}
      {roles.isError && <Alert severity="error" sx={{ m: 2 }}>{apiError(roles.error)}</Alert>}
      {roles.data?.length === 0 && <Box sx={{ p: 5, textAlign: 'center' }}><Typography fontWeight={800}>No roles yet</Typography><Typography color="text.secondary">Create a role and select its allowed modules.</Typography></Box>}
      {roles.data && roles.data.length > 0 && <TableContainer><Table sx={{ minWidth: 620 }}>
        <TableHead><TableRow><TableCell>Role</TableCell><TableCell>Module access</TableCell><TableCell>Status</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
        <TableBody>{roles.data.map((role) => {
          const count = permissionModules.filter(({ key }) => role.default_permissions[key]).length
          return <TableRow key={role.id} hover>
            <TableCell sx={{ fontWeight: 800 }}>{role.name}</TableCell>
            <TableCell>{count} of {permissionModules.length} modules allowed</TableCell>
            <TableCell><Chip size="small" label={role.is_active ? 'Active' : 'Inactive'} color={role.is_active ? 'success' : 'default'} variant="outlined" /></TableCell>
            <TableCell align="right"><IconButton aria-label={`Edit ${role.name}`} onClick={() => openEdit(role)}><EditRounded fontSize="small" /></IconButton></TableCell>
          </TableRow>
        })}</TableBody>
      </Table></TableContainer>}
    </Card>
    <Dialog open={open} onClose={save.isPending ? undefined : () => setOpen(false)} fullWidth maxWidth="sm" component="form" onSubmit={(event: React.FormEvent) => { event.preventDefault(); save.mutate() }}>
      <DialogTitle sx={{ fontWeight: 800 }}>{editing ? `Edit ${editing.name}` : 'New role'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '10px !important' }}>
        {saveError && <Alert severity="error">{saveError}</Alert>}
        <TextField label="Role name" value={name} onChange={(event) => setName(event.target.value)} required fullWidth />
        <FormControlLabel control={<Switch checked={active} onChange={(event) => setActive(event.target.checked)} />} label="Available for new assignments" />
        <Box><Typography fontWeight={800}>Default module access</Typography><Typography fontSize={12.5} color="text.secondary">Unselected modules are denied for users with this role unless an individual override allows them. Job Board also requires In Jobs or Out Jobs access.</Typography></Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: .5, maxHeight: 330, overflowY: 'auto' }}>
          {permissionModules.map(({ key, label }) => <FormControlLabel key={key} control={<Switch size="small" checked={Boolean(defaults[key])} onChange={(event) => setDefaults((current) => ({ ...current, [key]: event.target.checked }))} />} label={<Typography fontSize={13}>{label}</Typography>} />)}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2.5 }}>
        <Button color="inherit" onClick={() => setOpen(false)} disabled={save.isPending}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={save.isPending} startIcon={!editing ? <AddRounded /> : undefined}>{save.isPending ? 'Saving…' : 'Save role'}</Button>
      </DialogActions>
    </Dialog>
  </>
}
