import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@mui/material'
import { api, apiError } from '../api/client'
import type { ApiRecord } from '../types'

export type QuickAddTarget = 'customer' | 'pipeline_job' | 'job_type' | 'assigned_users' | 'everyone_in_department' | 'stock_item' | 'printer' | 'designer' | 'machine' | 'lamination_type' | 'binding_method' | 'priority' | 'side_mode' | 'payment_status'

const optionFields = new Set<QuickAddTarget>(['job_type', 'lamination_type', 'binding_method', 'priority', 'side_mode', 'payment_status'])
const baseChoices: Partial<Record<QuickAddTarget, { value: string; label: string }[]>> = {
  priority: ['low', 'normal', 'high', 'urgent'].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })),
  side_mode: [{ value: 'SS', label: 'SS (single-sided)' }, { value: 'DS', label: 'DS (double-sided)' }],
  payment_status: [{ value: 'unpaid', label: 'Pending' }, { value: 'partial', label: 'Partial' }, { value: 'paid', label: 'Paid' }],
}
const titles: Record<QuickAddTarget, string> = {
  customer: 'customer', pipeline_job: 'Pipeline job', job_type: 'job type', assigned_users: 'user',
  everyone_in_department: 'department', stock_item: 'stock item', printer: 'machine', designer: 'designer',
  machine: 'machine', lamination_type: 'lamination', binding_method: 'binding', priority: 'priority',
  side_mode: 'side', payment_status: 'payment status',
}
const endpoints: Partial<Record<QuickAddTarget, string>> = {
  customer: '/customers/', pipeline_job: '/pipeline-jobs/', assigned_users: '/users/',
  everyone_in_department: '/departments/', stock_item: '/stock-items/', printer: '/machines/',
  designer: '/users/', machine: '/machines/',
}

export function InJobQuickAddDialog({ target, onClose, onCreated }: {
  target: QuickAddTarget; onClose: () => void; onCreated: (target: QuickAddTarget, item: ApiRecord) => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const set = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }))
  const roles = useQuery({ queryKey: ['quick-add-roles'], queryFn: async () => (await api.get<Array<{ id: number; name: string; is_active: boolean; default_permissions: Record<string, boolean> }>>('/roles/')).data, enabled: target === 'assigned_users' || target === 'designer' })
  const departments = useQuery({ queryKey: ['quick-add-departments'], queryFn: async () => (await api.get<Array<{ id: number; name: string }>>('/departments/')).data, enabled: target === 'assigned_users' || target === 'designer' })
  const eligibleRoles = (Array.isArray(roles.data) ? roles.data : []).filter((role) => role.is_active && role.default_permissions?.injobs)
  const create = useMutation({
    mutationFn: async () => {
      let payload: Record<string, unknown>
      if (optionFields.has(target)) payload = { field_name: target, label: values.label?.trim(), base_value: values.base_value || '' }
      else if (target === 'assigned_users' || target === 'designer') payload = { username: values.username?.trim(), password: values.password, first_name: values.first_name?.trim() || '', last_name: values.last_name?.trim() || '', role: Number(values.role), ...(values.department ? { department: Number(values.department) } : {}) }
      else if (target === 'pipeline_job') payload = { client_name: values.client_name?.trim(), job_type: values.job_type?.trim(), job_date: values.job_date || new Date().toLocaleDateString('sv-SE'), quantity: Number(values.quantity || 1), contact_number: values.contact_number?.trim() || '' }
      else if (target === 'stock_item') payload = { name: values.name?.trim(), category: values.category?.trim() || 'paper', ...(values.gsm ? { gsm: Number(values.gsm) } : {}), size: values.size?.trim() || '' }
      else if (target === 'printer' || target === 'machine') payload = { code: values.code?.trim(), name: values.name?.trim() }
      else if (target === 'customer') payload = { name: values.name?.trim(), mobile: values.mobile?.trim() || '' }
      else payload = { name: values.name?.trim() }
      return (await api.post<ApiRecord>(optionFields.has(target) ? '/in-job-options/' : endpoints[target]!, payload)).data
    },
    onSuccess: (item) => onCreated(target, item),
    onError: (reason) => setError(apiError(reason)),
  })
  const input = (name: string, label: string, required = false, props: Record<string, unknown> = {}) => <TextField key={name} label={label} value={values[name] || ''} onChange={(event) => set(name, event.target.value)} required={required} size="small" fullWidth {...props} />
  const user = target === 'assigned_users' || target === 'designer'
  return <Dialog open onClose={create.isPending ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="quick-add-title">
    <Box component="form" onSubmit={(event: React.FormEvent) => { event.preventDefault(); setError(''); create.mutate() }}>
      <DialogTitle id="quick-add-title">Add new {titles[target]}</DialogTitle>
      <DialogContent dividers sx={{ display: 'grid', gap: 2, pt: '20px !important' }}>
        {error && <Alert severity="error">{error}</Alert>}
        {optionFields.has(target) && <>
          {input('label', 'Option name', true, { inputProps: { maxLength: 100 } })}
          {baseChoices[target] && <TextField select label="Behaves like" value={values.base_value || ''} onChange={(event) => set('base_value', event.target.value)} required size="small" fullWidth helperText="Uses the selected built-in value for calculations and workflow rules.">
            <MenuItem value="">Select a built-in value</MenuItem>{baseChoices[target]?.map((choice) => <MenuItem key={choice.value} value={choice.value}>{choice.label}</MenuItem>)}
          </TextField>}
        </>}
        {(target === 'customer' || target === 'everyone_in_department' || target === 'stock_item' || target === 'printer' || target === 'machine') && input('name', 'Name', true)}
        {target === 'customer' && input('mobile', 'Contact number')}
        {target === 'stock_item' && <><TextField select label="Category" value={values.category || 'paper'} onChange={(event) => set('category', event.target.value)} size="small" fullWidth>
          {[['paper', 'Paper'], ['toner', 'Toner'], ['ink', 'Ink'], ['finishing', 'Finishing Material'], ['packaging', 'Packaging'], ['other', 'Other']].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>{input('gsm', 'GSM', false, { type: 'number', inputProps: { min: 0 } })}{input('size', 'Size')}</>}
        {(target === 'printer' || target === 'machine') && input('code', 'Machine code', true)}
        {target === 'pipeline_job' && <>{input('client_name', 'Client name', true)}{input('job_type', 'Job type', true)}{input('job_date', 'Job date', false, { type: 'date', slotProps: { inputLabel: { shrink: true } } })}{input('quantity', 'Quantity', false, { type: 'number', inputProps: { min: 1 }, helperText: 'Defaults to 1.' })}{input('contact_number', 'Contact number')}</>}
        {user && <>
          {roles.isError && <Alert severity="error">Could not load roles: {apiError(roles.error)}</Alert>}
          {!roles.isLoading && !roles.isError && eligibleRoles.length === 0 && <Alert severity="warning">Create an active role with In Jobs permission before adding an assignable user.</Alert>}
          {input('username', 'Username', true)}{input('password', 'Password', true, { type: 'password' })}
          {input('first_name', 'First name')}{input('last_name', 'Last name')}
          <TextField select label="Role with In Jobs access" value={values.role || ''} onChange={(event) => set('role', event.target.value)} required size="small" fullWidth disabled={roles.isLoading || eligibleRoles.length === 0}>
            <MenuItem value="">Select role</MenuItem>{eligibleRoles.map((role) => <MenuItem key={role.id} value={String(role.id)}>{role.name}</MenuItem>)}
          </TextField>
          {departments.isError && <Alert severity="warning">Departments could not be loaded: {apiError(departments.error)}</Alert>}
          <TextField select label="Department (optional)" value={values.department || ''} onChange={(event) => set('department', event.target.value)} size="small" fullWidth disabled={departments.isLoading || departments.isError}>
            <MenuItem value="">No department</MenuItem>{(Array.isArray(departments.data) ? departments.data : []).map((item) => <MenuItem key={item.id} value={String(item.id)}>{item.name}</MenuItem>)}
          </TextField>
        </>}
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={create.isPending}>Cancel</Button><Button type="submit" variant="contained" disabled={create.isPending || (user && (roles.isLoading || eligibleRoles.length === 0))}>{create.isPending ? 'Saving…' : 'Save and select'}</Button></DialogActions>
    </Box>
  </Dialog>
}
