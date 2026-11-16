import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Box, Button, Card, FormControlLabel, Switch, TextField, Typography } from '@mui/material'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import { useNavigate } from 'react-router'
import { api, apiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { permissionModules } from '../config/modules'

export function RoleCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { refresh } = useAuth()
  const [name, setName] = useState('')
  const [active, setActive] = useState(true)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const save = useMutation({
    mutationFn: async () => (await api.post('/roles/', {
      name: name.trim(), is_active: active, default_permissions: permissions,
    })).data,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roles'] }),
        queryClient.invalidateQueries({ queryKey: ['form-lookups'] }),
        refresh(),
      ])
      navigate('/team-access?tab=roles', { replace: true })
    },
    onError: (reason) => setError(apiError(reason)),
  })

  return <>
    <Box sx={{ mb: 2 }}><Button startIcon={<ArrowBackRounded />} onClick={() => navigate('/team-access?tab=roles')}>Back to Roles</Button></Box>
    <PageHeader eyebrow="Create" title="Role" description="Choose the modules staff in this role can access." />
    <Card component="form" onSubmit={(event: React.FormEvent) => { event.preventDefault(); save.mutate() }} sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'grid', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Role name" value={name} onChange={(event) => setName(event.target.value)} required fullWidth />
        <FormControlLabel control={<Switch checked={active} onChange={(event) => setActive(event.target.checked)} />} label="Available for new assignments" />
        <Box><Typography fontWeight={800}>Default module access</Typography><Typography fontSize={12.5} color="text.secondary">Unselected modules are denied unless an individual override allows them. Job Board also requires In Jobs or Out Jobs access.</Typography></Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
          {permissionModules.map(({ key, label }) => <FormControlLabel key={key} control={<Switch size="small" checked={Boolean(permissions[key])} onChange={(event) => setPermissions((current) => ({ ...current, [key]: event.target.checked }))} />} label={<Typography fontSize={13}>{label}</Typography>} />)}
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}><Button onClick={() => navigate('/team-access?tab=roles')} disabled={save.isPending}>Cancel</Button><Button type="submit" variant="contained" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save role'}</Button></Box>
      </Box>
    </Card>
  </>
}
