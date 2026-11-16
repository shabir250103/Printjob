import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Alert, Box, Button, Card, MenuItem, TextField, Typography } from '@mui/material'
import { useSearchParams } from 'react-router'
import { api, apiError } from '../api/client'
import { PageHeader } from '../components/PageHeader'

const fields: Record<string, { label: string; base?: Array<{ value: string; label: string }> }> = {
  priority: { label: 'Priority', base: ['low', 'normal', 'high', 'urgent'].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })) },
  side_mode: { label: 'Side', base: [{ value: 'SS', label: 'SS (single-sided)' }, { value: 'DS', label: 'DS (double-sided)' }] },
  payment_status: { label: 'Payment Status', base: [{ value: 'unpaid', label: 'Pending' }, { value: 'partial', label: 'Partial' }, { value: 'paid', label: 'Paid' }] },
  job_type: { label: 'Job Type' },
  lamination_type: { label: 'Lamination' },
  binding_method: { label: 'Binding' },
}

export function InJobOptionCreatePage() {
  const [params] = useSearchParams()
  const fieldName = params.get('field') || ''
  const config = fields[fieldName]
  const [label, setLabel] = useState('')
  const [baseValue, setBaseValue] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const create = useMutation({
    mutationFn: async () => (await api.post('/in-job-options/', {
      field_name: fieldName, label: label.trim(), base_value: baseValue,
    })).data,
    onSuccess: () => setSaved(true),
    onError: (reason) => setError(apiError(reason)),
  })

  if (!config) return <Alert severity="error">Unknown In Job dropdown.</Alert>
  return <>
    <PageHeader eyebrow="In Job choices" title={`Add new ${config.label}`} description="This option will be available in In Job creation after you return to that tab." />
    <Card component="form" onSubmit={(event: React.FormEvent) => { event.preventDefault(); setError(''); create.mutate() }} sx={{ maxWidth: 620, p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'grid', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {saved && <Alert severity="success">Option created. Return to the In Job tab and select it; choices refresh when the tab gains focus.</Alert>}
        <TextField label="New option name" value={label} onChange={(event) => setLabel(event.target.value)} required inputProps={{ maxLength: 100 }} disabled={saved} />
        {config.base && <TextField select label="Behaves like" value={baseValue} onChange={(event) => setBaseValue(event.target.value)} required disabled={saved} helperText="Keeps calculations, payment rules, and reporting consistent.">
          <MenuItem value="">Select a built-in value</MenuItem>
          {config.base.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
        </TextField>}
        {fieldName === 'side_mode' && <Typography fontSize={12} color="text.secondary">Single-sided uses one click per sheet; double-sided uses two.</Typography>}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button type="button" onClick={() => window.close()}>{saved ? 'Close tab' : 'Cancel'}</Button>
          {!saved && <Button type="submit" variant="contained" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save option'}</Button>}
        </Box>
      </Box>
    </Card>
  </>
}
