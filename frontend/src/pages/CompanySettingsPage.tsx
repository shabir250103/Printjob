import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Divider,
  Grid, IconButton, InputAdornment, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import BusinessRounded from '@mui/icons-material/BusinessRounded'
import UploadRounded from '@mui/icons-material/UploadRounded'
import DeleteRounded from '@mui/icons-material/DeleteRounded'
import BrushRounded from '@mui/icons-material/BrushRounded'
import SaveRounded from '@mui/icons-material/SaveRounded'
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import { api, apiError, resolveMediaUrl } from '../api/client'

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

interface CompanySettings {
  id?: number
  company_name: string
  address: string
  gstin: string
  contact_number: string
  email: string
  authorized_person_name: string
  authorized_person_designation: string
  terms_and_conditions: string
  bank_name: string
  bank_account_number: string
  bank_ifsc: string
  company_logo_url?: string
  digital_signature_url?: string
}

const empty = (): CompanySettings => ({
  company_name: '', address: '', gstin: '', contact_number: '', email: '',
  authorized_person_name: '', authorized_person_designation: '',
  terms_and_conditions: '', bank_name: '', bank_account_number: '', bank_ifsc: '',
})

function SignatureCanvas({ onCapture, existingUrl }: { onCapture: (data: string) => void, existingUrl?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasDrawing, setHasDrawing] = useState(false)
  const [mode, setMode] = useState<'draw' | 'upload'>('draw')
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  const getPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const touch = e.touches[0]
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setDrawing(true)
    lastPoint.current = getPoint(e)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing || !canvasRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')!
    const pt = getPoint(e)
    if (lastPoint.current) {
      ctx.beginPath()
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
      ctx.lineTo(pt.x, pt.y)
      ctx.strokeStyle = '#1a237e'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
    }
    lastPoint.current = pt
    setHasDrawing(true)
  }

  const endDraw = () => {
    setDrawing(false)
    lastPoint.current = null
    if (hasDrawing && canvasRef.current) {
      onCapture(canvasRef.current.toDataURL('image/png'))
    }
  }

  const clear = () => {
    if (!canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')!
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setHasDrawing(false)
  }

  if (mode === 'upload') {
    return (
      <Box>
        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <Button size="small" variant="outlined" onClick={() => setMode('draw')}>
            Draw
          </Button>
          <Button size="small" variant="contained" onClick={() => setMode('upload')}>
            Upload Image
          </Button>
        </Box>
        {existingUrl && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Current signature:</Typography>
            <Box
              component="img" src={resolveMediaUrl(existingUrl)} alt="Current signature"
              sx={{ maxWidth: 220, maxHeight: 80, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}
            />
          </Box>
        )}
        <Button
          variant="outlined" component="label" startIcon={<UploadRounded />} size="small"
        >
          Upload signature image
          <input type="file" accept="image/*" hidden onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onloadend = () => onCapture(reader.result as string)
            reader.readAsDataURL(file)
          }} />
        </Button>
      </Box>
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
        <Button size="small" variant="contained" onClick={() => setMode('draw')}>
          Draw
        </Button>
        <Button size="small" variant="outlined" onClick={() => setMode('upload')}>
          Upload Image
        </Button>
      </Box>
      <Box
        sx={{
          border: '2px dashed', borderColor: 'divider', borderRadius: 2, overflow: 'hidden',
          cursor: 'crosshair', userSelect: 'none', background: '#fafcff',
          position: 'relative', maxWidth: 420,
        }}
      >
        <canvas
          ref={canvasRef} width={420} height={120}
          style={{ width: '100%', display: 'block' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
        {!hasDrawing && (
          <Typography
            sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              color: 'text.disabled', fontSize: 13, pointerEvents: 'none' }}
          >
            Sign here…
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
        <Button size="small" variant="text" color="error" startIcon={<DeleteRounded />} onClick={clear}>
          Clear
        </Button>
        {existingUrl && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary">Saved:</Typography>
            <Box
              component="img" src={resolveMediaUrl(existingUrl)} alt="Saved signature"
              sx={{ height: 32, border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 0.5 }}
            />
          </Box>
        )}
      </Box>
    </Box>
  )
}

export function CompanySettingsPage() {
  const [tab, setTab] = useState(0)
  const [form, setForm] = useState<CompanySettings>(empty())
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>('')
  const [signatureData, setSignatureData] = useState<string>('')
  const [signatureFile, setSignatureFile] = useState<File | null>(null)
  const [saved, setSaved] = useState(false)
  const client = useQueryClient()

  const query = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => (await api.get<CompanySettings>('/company-settings/')).data,
  })

  useEffect(() => {
    if (query.data && Object.keys(query.data).length > 0) {
      setForm(query.data)
      if (query.data.company_logo_url) setLogoPreview(query.data.company_logo_url)
    }
  }, [query.data])

  const mutation = useMutation({
    mutationFn: async () => {
      const data = new FormData()
      Object.entries(form).forEach(([key, value]) => {
        if (!['id', 'company_logo_url', 'digital_signature_url'].includes(key) && value != null) {
          data.append(key, String(value))
        }
      })
      if (logoFile) data.append('company_logo', logoFile)
      if (signatureFile) {
        data.append('digital_signature', signatureFile)
      } else if (signatureData && signatureData.startsWith('data:')) {
        // Convert canvas data URL to blob
        const response = await fetch(signatureData)
        const blob = await response.blob()
        data.append('digital_signature', blob, 'signature.png')
      }
      const isNew = !query.data?.id
      return isNew
        ? api.post('/company-settings/', data, { headers: { 'Content-Type': 'multipart/form-data' } })
        : api.patch('/company-settings/1/', data, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['company-settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const set = (key: keyof CompanySettings, value: string) => setForm(old => ({ ...old, [key]: value }))

  const field = (
    key: keyof CompanySettings, label: string,
    opts: { required?: boolean; multiline?: boolean; rows?: number; type?: string; helperText?: string } = {}
  ) => (
    <TextField
      label={label} value={form[key] || ''} onChange={e => set(key, e.target.value)}
      required={opts.required} multiline={opts.multiline} minRows={opts.rows}
      type={opts.type} helperText={opts.helperText}
      error={key === 'gstin' && Boolean(form.gstin) && !GSTIN_PATTERN.test(form.gstin)}
      slotProps={key === 'gstin' ? {
        input: { endAdornment: form.gstin && GSTIN_PATTERN.test(form.gstin) ? (
          <InputAdornment position="end"><CheckCircleRounded color="success" fontSize="small" /></InputAdornment>
        ) : undefined }
      } : undefined}
      fullWidth
    />
  )

  if (query.isPending) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: 'primary.main', color: 'white', display: 'flex' }}>
          <BusinessRounded />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700}>Company Settings</Typography>
          <Typography variant="body2" color="text.secondary">Configure company info used in invoices and quotations</Typography>
        </Box>
      </Box>

      {query.isError && <Alert severity="error" sx={{ mb: 2 }}>{apiError(query.error)}</Alert>}
      {mutation.isError && <Alert severity="error" sx={{ mb: 2 }}>{apiError(mutation.error)}</Alert>}
      {saved && <Alert severity="success" sx={{ mb: 2 }} icon={<CheckCircleRounded />}>Settings saved successfully!</Alert>}

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: '1px solid', borderColor: 'divider', px: 2 }}>
          <Tab label="Company Info" />
          <Tab label="Signature & Identity" />
          <Tab label="Bank Details" />
        </Tabs>

        <Box component="form" onSubmit={e => { e.preventDefault(); mutation.mutate() }}>
          {/* Tab 0: Company Info */}
          {tab === 0 && (
            <CardContent>
              <Grid container spacing={2.5}>
                {/* Logo upload */}
                <Grid size={12}>
                  <Typography variant="subtitle2" fontWeight={600} mb={1.5}>Company Logo</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
                    {logoPreview ? (
                      <Box sx={{ position: 'relative' }}>
                        <Box
                          component="img" src={resolveMediaUrl(logoPreview)} alt="Company logo"
                          sx={{ width: 100, height: 100, objectFit: 'contain', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1 }}
                        />
                        <Tooltip title="Remove logo">
                          <IconButton
                            size="small" sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}
                            onClick={() => { setLogoPreview(''); setLogoFile(null) }}
                          >
                            <DeleteRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ) : (
                      <Box
                        sx={{ width: 100, height: 100, border: '2px dashed', borderColor: 'divider', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.disabled' }}
                      >
                        <BusinessRounded sx={{ fontSize: 36 }} />
                      </Box>
                    )}
                    <Box>
                      <Button variant="outlined" component="label" startIcon={<UploadRounded />}>
                        {logoPreview ? 'Replace Logo' : 'Upload Logo'}
                        <input type="file" accept="image/*" hidden onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          setLogoFile(file)
                          const reader = new FileReader()
                          reader.onloadend = () => setLogoPreview(reader.result as string)
                          reader.readAsDataURL(file)
                        }} />
                      </Button>
                      <Typography variant="caption" display="block" mt={0.5} color="text.secondary">
                        PNG, JPG or SVG. Recommended: 200×200px
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                <Grid size={12}><Divider /></Grid>

                <Grid size={{ xs: 12, md: 8 }}>{field('company_name', 'Company Name', { required: true })}</Grid>
                <Grid size={{ xs: 12, md: 4 }}>{field('gstin', 'GSTIN', { helperText: '15-character GST Identification Number' })}</Grid>
                <Grid size={{ xs: 12, md: 6 }}>{field('contact_number', 'Contact Number')}</Grid>
                <Grid size={{ xs: 12, md: 6 }}>{field('email', 'Email Address', { type: 'email' })}</Grid>
                <Grid size={12}>{field('address', 'Company Address', { multiline: true, rows: 3 })}</Grid>
              </Grid>
            </CardContent>
          )}

          {/* Tab 1: Signature & Identity */}
          {tab === 1 && (
            <CardContent>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, md: 6 }}>
                  {field('authorized_person_name', 'Authorized Person Name')}
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  {field('authorized_person_designation', 'Designation / Title')}
                </Grid>
                <Grid size={12}>
                  {field('terms_and_conditions', 'Default Terms & Conditions', { multiline: true, rows: 4 })}
                </Grid>
                <Grid size={12}>
                  <Divider sx={{ mb: 2 }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <BrushRounded color="primary" />
                    <Typography variant="subtitle2" fontWeight={600}>Digital Signature / E-Signature</Typography>
                  </Box>
                  <SignatureCanvas
                    onCapture={setSignatureData}
                    existingUrl={query.data?.digital_signature_url}
                  />
                </Grid>
              </Grid>
            </CardContent>
          )}

          {/* Tab 2: Bank Details */}
          {tab === 2 && (
            <CardContent>
              <Typography variant="body2" color="text.secondary" mb={2.5}>
                Bank details will appear on the invoice PDF for easy payment reference.
              </Typography>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, md: 6 }}>{field('bank_name', 'Bank Name')}</Grid>
                <Grid size={{ xs: 12, md: 6 }}>{field('bank_account_number', 'Account Number')}</Grid>
                <Grid size={{ xs: 12, md: 4 }}>{field('bank_ifsc', 'IFSC Code')}</Grid>
              </Grid>
            </CardContent>
          )}

          <Box sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 2, alignItems: 'center' }}>
            <Button
              type="submit" variant="contained" size="large"
              startIcon={mutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SaveRounded />}
              disabled={mutation.isPending || !form.company_name}
            >
              {mutation.isPending ? 'Saving…' : 'Save Settings'}
            </Button>
            {saved && (
              <Typography variant="body2" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CheckCircleRounded fontSize="small" /> Saved successfully
              </Typography>
            )}
          </Box>
        </Box>
      </Card>
    </Box>
  )
}
