import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Alert, Autocomplete, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  MenuItem, Switch, TextField, Typography,
} from '@mui/material'
import PaymentsRounded from '@mui/icons-material/PaymentsRounded'
import { api, apiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import type { ApiRecord, FieldConfig } from '../types'

const PAYMENT_FIELD_NAMES = new Set([
  'total_amount', 'advance', 'balance', 'expenses', 'profit', 'payment_status',
  'payment_method', 'vendor_cost', 'vendor_total_payment', 'vendor_advance',
  'vendor_balance', 'vendor_payment_status', 'customer_payment_method', 'vendor_payment_method',
  'subtotal', 'gst_amount', 'grand_total', 'delivery_charges',
])

const selectedIds = (value: unknown): number[] => Array.isArray(value) ? value.map(Number) : []

interface Props {
  open: boolean
  title: string
  fields: FieldConfig[]
  record?: ApiRecord | null
  pending?: boolean
  error?: string
  page?: boolean
  onClose: () => void
  onSave: (data: Record<string, unknown>) => void
  onRecordPayment?: (record: ApiRecord, target?: 'customer' | 'vendor') => void
}

export function RecordDialog({ open, title, fields: rawFields, record, pending, error, page = false, onClose, onSave, onRecordPayment }: Props) {
  let canShowPayments = true
  try {
    const auth = useAuth()
    canShowPayments = auth?.canShowPayments ?? Boolean(auth?.auth?.user?.is_superuser || (auth?.auth?.user?.show_payment_details ?? true))
  } catch {
    // Standalone render outside AuthProvider
  }
  const fields = canShowPayments ? rawFields : rawFields.filter((f) => !PAYMENT_FIELD_NAMES.has(f.name))
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewError, setPreviewError] = useState('')
  const lookupEndpoints = [...new Set(fields.map((field) => field.lookupEndpoint).filter((endpoint): endpoint is string => Boolean(endpoint)))]
  const lookups = useQuery<Record<string, ApiRecord[]>>({
    queryKey: ['form-lookups', ...lookupEndpoints],
    enabled: open && lookupEndpoints.length > 0,
    queryFn: async () => Object.fromEntries(await Promise.all(lookupEndpoints.map(async (endpoint) => {
      const { data } = await api.get<ApiRecord[] | { results: ApiRecord[] }>(endpoint)
      return [endpoint, Array.isArray(data) ? data : data.results]
    }))),
  })

  useEffect(() => {
    const initial: Record<string, unknown> = {}
    fields.forEach((field) => {
      initial[field.name] = record?.[field.name] ?? field.defaultValue ?? (field.multiple ? [] : field.type === 'boolean' ? false : '')
    })
    setValues(initial)
    setPreviewUrl('')
    setPreviewError('')
  }, [record, fields, open])

  useEffect(() => {
    if (!lookups.data || record) return
    setValues((prev) => {
      let updated = false
      const next = { ...prev }
      fields.forEach((field) => {
        if (field.type === 'lookup' && field.name === 'role' && !next[field.name]) {
          const options = lookups.data?.[field.lookupEndpoint || '']
          if (Array.isArray(options) && options.length > 0 && options[0]?.id) {
            next[field.name] = options[0].id
            updated = true
          }
        }
      })
      return updated ? next : prev
    })
  }, [lookups.data, record, fields])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const viewReferenceImage = async () => {
    if (!record) return
    try {
      setPreviewError('')
      const response = await api.get(`/pipeline-jobs/${record.id}/reference-image/`, { responseType: 'blob' })
      setPreviewUrl(URL.createObjectURL(response.data))
    } catch (reason) {
      setPreviewError(apiError(reason))
    }
  }

  const downloadReferenceDocument = async (id: number, name: string) => {
    try {
      setPreviewError('')
      const response = await api.get(`/job-documents/${id}/download/`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (reason) {
      setPreviewError(apiError(reason))
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const data = Object.fromEntries(Object.entries(values).map(([key, value]): [string, unknown] => {
      const field = fields.find((item) => item.name === key)
      if (field?.multiple) return [key, value]
      if (field?.type === 'number' || field?.type === 'lookup') return [key, value === '' ? null : Number(value)]
      return [key, value]
    }).filter(([key, value]) => {
      // Posted payments are audit totals derived from payments; do not submit on edit
      if (record && ['advance', 'vendor_advance', 'payment_status', 'vendor_payment_status'].includes(key)) {
        return false
      }
      if (value !== '' && value !== null && !(Array.isArray(value) && value.length === 0)) return true
      const field = fields.find((item) => item.name === key)
      // Send intentional clearing on edit, but never submit empty passwords or file controls.
      return Boolean(record && !['password', 'image', 'files'].includes(field?.type || '') && record[key] != null)
    }))
    onSave(data)
  }

  const contents = <>
      <DialogTitle sx={{ fontWeight: 800, fontSize: 22 }}>{title}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: page ? 'repeat(3, 1fr)' : '1fr 1fr' }, gap: 2, pt: '10px !important' }}>
        {error && <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>{error}</Alert>}
        {previewError && <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>{previewError}</Alert>}
        {lookups.isError && <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>Could not load assignment choices: {apiError(lookups.error)}</Alert>}
        {fields.map((field) => field.type === 'files' ? (
          <Box key={field.name} sx={{ gridColumn: '1 / -1', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
            <Typography fontWeight={700} fontSize={14} sx={{ mb: 1 }}>{field.label}</Typography>
            <Button component="label" variant="outlined" size="small">
              Select files
              <input hidden type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => {
                const files = Array.from(event.target.files || [])
                setValues((current) => ({ ...current, [field.name]: files }))
                setPreviewError('')
              }} />
            </Button>
            {Array.isArray(values[field.name]) && (values[field.name] as File[]).length > 0 && <Typography variant="body2" sx={{ mt: 1 }}>
              {(values[field.name] as File[]).map((file) => file.name).join(', ')}
            </Typography>}
            {Array.isArray(record?.reference_documents) && record.reference_documents.map((item) => {
              const saved = item as { id: number; name: string }
              return <Button key={saved.id} size="small" onClick={() => downloadReferenceDocument(saved.id, saved.name)} sx={{ mt: 1, mr: 1 }}>{saved.name}</Button>
            })}
            {Boolean(record?.has_reference_image) && <Button size="small" onClick={viewReferenceImage} sx={{ mt: 1 }}>View older reference image</Button>}
            {previewUrl && <Box component="img" src={previewUrl} alt="Saved reference image" sx={{ display: 'block', mt: 1, maxWidth: '100%', maxHeight: 240, objectFit: 'contain' }} />}
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>Optional. PDF, JPG, JPEG, or PNG; up to 10 MB each. You can add more files when editing the job.</Typography>
          </Box>
        ) : field.type === 'boolean' ? (
          field.name === 'show_payment_details' ? (
            <Box
              key={field.name}
              sx={{
                gridColumn: '1 / -1',
                p: 2,
                borderRadius: 2,
                border: '1.5px solid',
                borderColor: values[field.name] ? 'primary.main' : 'divider',
                bgcolor: values[field.name] ? 'rgba(239, 108, 62, 0.05)' : 'background.paper',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Box>
                <Typography variant="subtitle2" fontWeight={800} color={values[field.name] ? 'primary.main' : 'text.primary'}>
                  {field.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {values[field.name]
                    ? 'Yes — User is allowed to view payment amounts, customer/vendor advances, and finance transactions.'
                    : 'No — Only payment columns and finance details are removed. The employee still has full access to Pipeline, Job Board, In Jobs, and production workflows.'}
                </Typography>
              </Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={Boolean(values[field.name])}
                    onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.checked }))}
                    color="primary"
                  />
                }
                label={<Typography fontWeight={800} fontSize={14}>{values[field.name] ? 'Yes' : 'No'}</Typography>}
                sx={{ m: 0 }}
              />
            </Box>
          ) : (
            <FormControlLabel
              key={field.name}
              control={<Switch checked={Boolean(values[field.name])} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.checked }))} />}
              label={field.label}
            />
          )
        ) : field.type === 'image' ? (
          <Box key={field.name} sx={{ gridColumn: '1 / -1', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
            <Typography fontWeight={700} fontSize={14} sx={{ mb: 1 }}>{field.label}</Typography>
            <Button component="label" variant="outlined" size="small">
              {values[field.name] instanceof File ? 'Change image' : 'Choose image'}
              <input hidden type="file" accept="image/*" onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  setValues((current) => ({ ...current, [field.name]: file }))
                  setPreviewUrl(URL.createObjectURL(file))
                  setPreviewError('')
                }
              }} />
            </Button>
            {Boolean(record?.has_reference_image) && <Button size="small" onClick={viewReferenceImage} sx={{ ml: 1 }}>View saved image</Button>}
            {values[field.name] instanceof File && <Typography variant="body2" sx={{ mt: 1 }}>{(values[field.name] as File).name}</Typography>}
            {previewUrl && <Box component="img" src={previewUrl} alt="Reference image preview" sx={{ display: 'block', mt: 1.5, maxWidth: '100%', maxHeight: 240, objectFit: 'contain' }} />}
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>PNG, JPEG, or another supported image, up to 10 MB.</Typography>
          </Box>
        ) : canShowPayments && record && (field.name === 'advance' || field.name === 'vendor_advance') ? (
          <Card
            key={field.name}
            variant="outlined"
            sx={{
              gridColumn: '1 / -1',
              p: 2,
              bgcolor: 'action.hover',
              borderRadius: 2,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography variant="subtitle2" fontWeight={800} color="text.primary">
                  {field.name === 'vendor_advance' ? 'Vendor Payout Status' : 'Customer Payment Status'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Posted payments are tracked in the finance ledger. Use the payment button to record new payments.
                </Typography>
              </Box>
              {onRecordPayment && (
                <Button
                  size="small"
                  variant="contained"
                  color={field.name === 'vendor_advance' ? 'warning' : 'success'}
                  startIcon={<PaymentsRounded />}
                  onClick={() => onRecordPayment(record, field.name === 'vendor_advance' ? 'vendor' : 'customer')}
                  sx={{ fontWeight: 700 }}
                >
                  {field.name === 'vendor_advance' ? 'Record Vendor Payment' : 'Record Payment'}
                </Button>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5, mt: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip
                size="small"
                label={`Paid: ₹${Number(record[field.name] || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                color="success"
                variant="outlined"
                sx={{ fontWeight: 700 }}
              />
              <Chip
                size="small"
                label={`Pending: ₹${Number((field.name === 'vendor_advance' ? record.vendor_balance : record.balance) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                color={Number((field.name === 'vendor_advance' ? record.vendor_balance : record.balance) || 0) > 0 ? 'warning' : 'default'}
                variant="outlined"
                sx={{ fontWeight: 700 }}
              />
            </Box>
          </Card>
        ) : field.type === 'lookup' && field.multiple ? (
          <Autocomplete
            key={field.name}
            multiple
            filterSelectedOptions
            options={lookups.data?.[field.lookupEndpoint || ''] || []}
            value={(lookups.data?.[field.lookupEndpoint || ''] || []).filter((item) => selectedIds(values[field.name]).includes(Number(item.id)))}
            getOptionLabel={(item) => {
              const name = [item.first_name, item.last_name].filter(Boolean).join(' ')
              const label = String(item[field.lookupLabel || 'name'] || `#${item.id}`)
              return name ? `${name} (${label})` : label
            }}
            isOptionEqualToValue={(option, value) => Number(option.id) === Number(value.id)}
            onChange={(_event, selected) => setValues((current) => ({ ...current, [field.name]: selected.map((item) => Number(item.id)) }))}
            disabled={lookups.isLoading || lookups.isError}
            renderInput={(params) => <TextField {...params} label={field.label} placeholder={field.name === 'assigned_users' ? 'Search and add staff' : 'Search and add departments'} helperText={`Select one or more ${field.name === 'assigned_users' ? 'staff members' : 'departments'}.`} />}
            sx={{ gridColumn: '1 / -1' }}
          />
        ) : field.type === 'lookup' ? (
          <TextField
            key={field.name}
            label={field.label}
            select
            required={field.required || (!record && field.requiredOnCreate)}
            disabled={lookups.isLoading || lookups.isError}
            value={values[field.name] ?? ''}
            onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
            helperText={lookups.isLoading ? 'Loading choices…' : undefined}
          >
            {!field.multiple && <MenuItem value=""><em>Unassigned</em></MenuItem>}
            {(lookups.data?.[field.lookupEndpoint || ''] || []).map((item) => (
              <MenuItem key={item.id} value={item.id}>{String(item[field.lookupLabel || 'name'] || `#${item.id}`)}</MenuItem>
            ))}
          </TextField>
        ) : (
          <TextField
            key={field.name}
            label={field.label}
            required={field.required}
            type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
            select={field.type === 'select'}
            multiline={field.type === 'textarea'}
            minRows={field.type === 'textarea' ? 3 : undefined}
            value={String(values[field.name] ?? '')}
            onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
            slotProps={field.type === 'date' ? { inputLabel: { shrink: true } } : field.type === 'number' ? { htmlInput: { step: 'any' } } : undefined}
            sx={{ gridColumn: field.type === 'textarea' ? '1 / -1' : undefined }}
          >
            {field.options && !field.options.some((option) => String(option.value) === String(values[field.name] ?? '')) && Boolean(values[field.name]) &&
              <MenuItem value={String(values[field.name])}>{String(values[field.name]).replaceAll('_', ' ')} (existing)</MenuItem>}
            {field.options?.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </TextField>
        ))}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2.5 }}>
        <Button onClick={onClose} color="inherit" disabled={pending}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={pending || lookups.isLoading || lookups.isError} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>Save</Button>
      </DialogActions>
  </>
  return page
    ? <Card component="form" onSubmit={submit} sx={{ maxWidth: 1160, mx: 'auto' }}>{contents}</Card>
    : <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="sm" component="form" onSubmit={submit}>{contents}</Dialog>
}
