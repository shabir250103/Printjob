import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router'
import {
  Alert, Box, Button, Card, CircularProgress, Dialog, DialogContent, DialogTitle,
  Divider, IconButton, MenuItem, Paper, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import VisibilityRounded from '@mui/icons-material/VisibilityRounded'
import DownloadRounded from '@mui/icons-material/DownloadRounded'
import PrintRounded from '@mui/icons-material/PrintRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import AddTaskRounded from '@mui/icons-material/AddTaskRounded'
import { api, apiError, resolveMediaUrl } from '../api/client'
import { generateQuotationPDF, type QuotationData } from '../utils/pdf'

type Item = { description: string; quantity: string; unit_price: string }
type Quote = {
  id?: number
  quotation_number?: string
  customer: number | null
  customer_name: string
  contact_number: string | null
  billing_address: string | null
  quotation_date: string
  valid_until: string | null
  status: string
  items: Item[]
  discount: string
  gst_percent: string
  notes: string | null
  terms: string | null
  source_enquiry?: number | null
  totals?: {
    subtotal: string
    taxable_amount: string
    gst_amount: string
    grand_total: string
  }
}
type Customer = { id: number; name: string; mobile: string; billing_address: string }

const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const empty = (): Quote => ({
  customer: null, customer_name: '', contact_number: '', billing_address: '', quotation_date: today(),
  valid_until: null, status: 'draft', items: [{ description: '', quantity: '1', unit_price: '0' }],
  discount: '0', gst_percent: '18', notes: '', terms: '',
})

const fmt = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function quoteFromEnquiry(enquiry?: Record<string, unknown>): Quote {
  if (!enquiry) return empty()
  const customerName = String(enquiry.customer_name || '')
  const jobType = String(enquiry.job_type || 'Printing service')
  const description = [jobType, enquiry.size, enquiry.printing_method].filter(Boolean).join(' — ')
  const notes = [enquiry.quote, enquiry.remarks].filter(Boolean).join('\n\n')
  return {
    ...empty(),
    customer: enquiry.customer ? Number(enquiry.customer) : null,
    customer_name: customerName,
    contact_number: String(enquiry.contact_number || ''),
    quotation_date: String(enquiry.follow_up_date || today()),
    items: [{ description, quantity: String(enquiry.quantity || 1), unit_price: '0' }],
    notes,
    source_enquiry: Number(enquiry.id),
  }
}

function QuotationPreviewModal({ quoteId, onClose }: { quoteId: number; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['quotation-preview', quoteId],
    queryFn: async () => (await api.get<QuotationData>(`/quotations/${quoteId}/preview-data/`)).data,
  })
  const [downloading, setDownloading] = useState(false)

  if (query.isPending) return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogContent sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></DialogContent>
    </Dialog>
  )

  if (query.isError) return (
    <Dialog open onClose={onClose} maxWidth="sm">
      <DialogContent><Alert severity="error">{apiError(query.error)}</Alert></DialogContent>
    </Dialog>
  )

  const q = query.data!
  const comp = q.company
  const subtotal = Number(q.totals?.subtotal || 0)
  const discount = Number(q.discount || 0)
  const taxable = subtotal - discount
  const gstPct = Number(q.gst_percent || 0)
  const gstAmt = Math.round(taxable * gstPct) / 100
  const grandTotal = taxable + gstAmt
  const cgst = Math.round(gstAmt * 50) / 100
  const sgst = gstAmt - cgst

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await generateQuotationPDF(q)
    } finally {
      setDownloading(false)
    }
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return
    const companyName = comp?.company_name || 'Libin Prints'
    printWindow.document.write(`<!DOCTYPE html><html><head>
      <title>Quotation ${q.quotation_number}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #222; }
        .header { background: #17212b; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
        .logo { max-height: 60px; max-width: 120px; margin-bottom: 6px; }
        .company-name { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
        .company-detail { font-size: 10px; color: #ccc; }
        .quote-badge { background: #ef6c3e; color: white; padding: 6px 18px; border-radius: 4px; font-size: 14px; font-weight: bold; }
        .meta-row { display: flex; gap: 16px; padding: 12px 20px; background: #f5f3ef; font-size: 11px; color: #555; }
        .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px 20px; }
        .party-box { border: 1px solid #ddd; border-radius: 6px; padding: 12px; }
        .party-label { font-size: 9px; font-weight: bold; color: #ef6c3e; text-transform: uppercase; margin-bottom: 4px; }
        .party-name { font-size: 13px; font-weight: bold; color: #17212b; margin-bottom: 2px; }
        .party-detail { font-size: 10px; color: #666; line-height: 1.5; }
        table { width: calc(100% - 40px); margin: 0 20px; border-collapse: collapse; }
        thead { background: #17212b; color: white; }
        th, td { padding: 7px 10px; text-align: left; font-size: 11px; border: 1px solid #ddd; }
        .right { text-align: right; }
        .center { text-align: center; }
        .summary { width: 240px; margin-left: auto; margin-right: 20px; margin-top: 12px; }
        .summary-row { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 11px; border-bottom: 1px solid #eee; }
        .summary-total { display: flex; justify-content: space-between; padding: 7px 8px; background: #ef6c3e; color: white; font-weight: bold; font-size: 13px; }
        .sig-box { width: 200px; margin-left: auto; margin-right: 20px; margin-top: 20px; border: 1px solid #ddd; border-radius: 6px; padding: 10px; text-align: center; }
        .sig-label { font-size: 9px; font-weight: bold; color: #ef6c3e; margin-bottom: 6px; }
        .sig-img { max-width: 160px; max-height: 50px; }
        .sig-line { border-top: 1px solid #ccc; margin: 8px 0; }
        .sig-name { font-size: 11px; font-weight: bold; }
        .sig-desig { font-size: 9px; color: #888; }
        .footer { margin-top: 20px; background: #17212b; color: #aaa; padding: 10px 20px; font-size: 9px; }
        @media print { body { margin: 0; } }
      </style>
    </head><body>
      <div class="header">
        <div>
          ${comp?.company_logo_url ? `<img class="logo" src="${resolveMediaUrl(comp.company_logo_url)}" />` : ''}
          <div class="company-name">${companyName}</div>
          <div class="company-detail">${comp?.address || ''}</div>
          ${comp?.gstin ? `<div class="company-detail">GSTIN: ${comp.gstin}</div>` : ''}
          <div class="company-detail">${[comp?.contact_number, comp?.email].filter(Boolean).join(' | ')}</div>
        </div>
        <div class="quote-badge">QUOTATION</div>
      </div>
      <div class="meta-row">
        <span><b>Quotation No:</b> ${q.quotation_number}</span>
        <span><b>Date:</b> ${q.quotation_date}</span>
        <span><b>Valid Until:</b> ${q.valid_until || 'Not specified'}</span>
        <span><b>Status:</b> ${q.status.toUpperCase()}</span>
      </div>
      <div class="parties">
        <div class="party-box">
          <div class="party-label">From</div>
          <div class="party-name">${companyName}</div>
          <div class="party-detail">${(comp?.address || '').replace(/\n/g, '<br/>')}</div>
          ${comp?.gstin ? `<div class="party-detail"><b>GSTIN:</b> ${comp.gstin}</div>` : ''}
        </div>
        <div class="party-box">
          <div class="party-label">Quoted To</div>
          <div class="party-name">${q.customer_name}</div>
          <div class="party-detail">${(q.billing_address || '').replace(/\n/g, '<br/>')}</div>
          ${q.contact_number ? `<div class="party-detail">${q.contact_number}</div>` : ''}
        </div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Description</th><th class="center">Qty</th><th class="right">Unit Price</th><th class="right">Amount</th></tr></thead>
        <tbody>
          ${q.items.map((it, i) => `<tr><td class="center">${i + 1}</td><td>${it.description}</td><td class="center">${it.quantity}</td><td class="right">${fmt(it.unit_price)}</td><td class="right">${fmt(Number(it.quantity) * Number(it.unit_price))}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="summary">
        <div class="summary-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
        ${discount > 0 ? `<div class="summary-row"><span>Discount</span><span>- ${fmt(discount)}</span></div>` : ''}
        <div class="summary-row"><span>Taxable Amount</span><span>${fmt(taxable)}</span></div>
        <div class="summary-row"><span>CGST (${gstPct / 2}%)</span><span>${fmt(cgst)}</span></div>
        <div class="summary-row"><span>SGST (${gstPct / 2}%)</span><span>${fmt(sgst)}</span></div>
        <div class="summary-total"><span>Grand Total</span><span>${fmt(grandTotal)}</span></div>
      </div>
      ${comp?.authorized_person_name ? `
      <div class="sig-box">
        <div class="sig-label">Authorised Signatory</div>
        ${comp?.digital_signature_url ? `<img class="sig-img" src="${resolveMediaUrl(comp.digital_signature_url)}" />` : '<div style="height:40px"></div>'}
        <div class="sig-line"></div>
        <div class="sig-name">${comp.authorized_person_name}</div>
        ${comp.authorized_person_designation ? `<div class="sig-desig">${comp.authorized_person_designation}</div>` : ''}
      </div>` : ''}
      ${q.notes ? `<div style="padding: 12px 20px; font-size: 10px; color: #555;"><b>Notes:</b> ${q.notes}</div>` : ''}
      <div class="footer">
        ${comp?.terms_and_conditions || q.terms ? `<div>Terms: ${comp?.terms_and_conditions || q.terms}</div>` : ''}
        <div style="margin-top:4px; text-align:center;">This is a computer-generated quotation.</div>
      </div>
    </body></html>`)
    printWindow.document.close()
    setTimeout(() => { printWindow.print() }, 500)
  }

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { maxHeight: '95vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>{q.quotation_number}</Typography>
          <Typography variant="caption" color="text.secondary">{q.quotation_date} · {q.customer_name}</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Download PDF">
            <span>
              <IconButton onClick={handleDownload} disabled={downloading} color="primary">
                {downloading ? <CircularProgress size={20} /> : <DownloadRounded />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Print">
            <IconButton onClick={handlePrint}><PrintRounded /></IconButton>
          </Tooltip>
          <Tooltip title="Close">
            <IconButton onClick={onClose}><CloseRounded /></IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
        {/* Header */}
        <Box sx={{ bgcolor: '#17212b', color: 'white', p: 2.5, borderRadius: 2, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            {comp?.company_logo_url && (
              <Box component="img" src={resolveMediaUrl(comp.company_logo_url)} alt="Logo" sx={{ maxHeight: 50, maxWidth: 100, mb: 1, objectFit: 'contain' }} />
            )}
            <Typography fontWeight={800} fontSize={16}>{comp?.company_name || 'Libin Prints'}</Typography>
            {comp?.address && <Typography fontSize={11} color="rgba(255,255,255,0.65)" sx={{ whiteSpace: 'pre-line' }}>{comp.address}</Typography>}
            {comp?.gstin && <Typography fontSize={11} color="rgba(255,255,255,0.65)">GSTIN: {comp.gstin}</Typography>}
          </Box>
          <Box sx={{ bgcolor: 'primary.main', px: 2.5, py: 1, borderRadius: 1 }}>
            <Typography fontWeight={700} fontSize={14}>QUOTATION</Typography>
          </Box>
        </Box>

        {/* Parties */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
            <Typography fontSize={9} fontWeight={700} color="primary.main" textTransform="uppercase" mb={0.5}>Quoted To</Typography>
            <Typography fontWeight={700}>{q.customer_name}</Typography>
            {q.billing_address && <Typography fontSize={12} color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{q.billing_address}</Typography>}
            {q.contact_number && <Typography fontSize={11} color="text.secondary" mt={0.5}>{q.contact_number}</Typography>}
          </Box>
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
            <Typography fontSize={9} fontWeight={700} color="primary.main" textTransform="uppercase" mb={0.5}>Quotation Details</Typography>
            <Typography fontSize={12}><b>Quotation No:</b> {q.quotation_number}</Typography>
            <Typography fontSize={12}><b>Date:</b> {q.quotation_date}</Typography>
            <Typography fontSize={12}><b>Valid Until:</b> {q.valid_until || 'Not specified'}</Typography>
            <Typography fontSize={12}><b>Status:</b> {q.status.toUpperCase()}</Typography>
          </Box>
        </Box>

        {/* Table */}
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden', mb: 2 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#17212b' }}>
              <TableRow>
                {['#', 'Description', 'Qty', 'Unit Price', 'Amount'].map(h => (
                  <TableCell key={h} sx={{ color: 'white', fontWeight: 700, fontSize: 12, py: 1 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {q.items.map((it, i) => (
                <TableRow key={i} sx={{ '&:nth-of-type(even)': { bgcolor: 'action.hover' } }}>
                  <TableCell sx={{ width: 40, color: 'text.secondary' }}>{i + 1}</TableCell>
                  <TableCell>{it.description}</TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>{it.quantity}</TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>{fmt(it.unit_price)}</TableCell>
                  <TableCell sx={{ textAlign: 'right', fontWeight: 600 }}>{fmt(Number(it.quantity) * Number(it.unit_price))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        {/* Summary + Signatory */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, textAlign: 'center' }}>
            <Typography fontSize={9} fontWeight={700} color="primary.main" textTransform="uppercase" mb={1}>Authorised Signatory</Typography>
            {comp?.digital_signature_url && (
              <Box component="img" src={resolveMediaUrl(comp.digital_signature_url)} alt="Signature" sx={{ maxWidth: 160, maxHeight: 60, mb: 1 }} />
            )}
            <Divider />
            <Typography fontWeight={700} fontSize={12} mt={1}>{comp?.authorized_person_name || 'Authorised Person'}</Typography>
            <Typography fontSize={11} color="text.secondary">{comp?.authorized_person_designation}</Typography>
          </Box>
          <Box>
            {[
              ['Subtotal', fmt(subtotal)],
              ...(discount > 0 ? [['Discount', `- ${fmt(discount)}`]] : []),
              ['Taxable Amount', fmt(taxable)],
              [`CGST (${gstPct / 2}%)`, fmt(cgst)],
              [`SGST (${gstPct / 2}%)`, fmt(sgst)],
            ].map(([lbl, val]) => (
              <Box key={lbl} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, px: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography fontSize={12} color="text.secondary">{lbl}</Typography>
                <Typography fontSize={12} fontWeight={500}>{val}</Typography>
              </Box>
            ))}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1.2, px: 1.5, bgcolor: 'primary.main', borderRadius: '0 0 8px 8px', color: 'white' }}>
              <Typography fontWeight={800} fontSize={14}>Grand Total</Typography>
              <Typography fontWeight={800} fontSize={14}>{fmt(grandTotal)}</Typography>
            </Box>
          </Box>
        </Box>

        {q.notes && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
            <Typography fontSize={11} fontWeight={600} mb={0.5}>Notes</Typography>
            <Typography fontSize={11} color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{q.notes}</Typography>
          </Box>
        )}
        {(comp?.terms_and_conditions || q.terms) && (
          <Box sx={{ mt: 1.5, p: 2, bgcolor: '#17212b', borderRadius: 2 }}>
            <Typography fontSize={10} color="rgba(255,255,255,0.5)">Terms & Conditions</Typography>
            <Typography fontSize={11} color="rgba(255,255,255,0.75)" sx={{ whiteSpace: 'pre-line', mt: 0.5 }}>
              {comp?.terms_and_conditions || q.terms}
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function QuotationPage() {
  const { id } = useParams()
  const location = useLocation()
  const sourceEnquiry = (location.state as { sourceEnquiry?: Record<string, unknown> } | null)?.sourceEnquiry
  const query = useQuery({
    queryKey: ['resource', 'quotation', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get<Quote>(`/quotations/${id}/`)).data,
  })

  if (id && query.isPending) return <CircularProgress />
  if (query.isError) return <Alert severity="error">{apiError(query.error)}</Alert>

  return <QuotationEditor key={id || `new-${sourceEnquiry?.id || ''}`} initial={query.data || quoteFromEnquiry(sourceEnquiry)} />
}

function QuotationEditor({ initial }: { initial: Quote }) {
  const [value, setValue] = useState(initial)
  const [previewOpen, setPreviewOpen] = useState(false)
  const navigate = useNavigate()
  const client = useQueryClient()

  const customers = useQuery({
    queryKey: ['form-lookups', 'quotation-customers'],
    queryFn: async () => (await api.get<Customer[]>('/quotations/customers/')).data,
  })

  const save = useMutation({
    mutationFn: async () => {
      const { id, quotation_number: _number, totals: _totals, ...body } = value
      return id ? api.patch(`/quotations/${id}/`, body) : api.post('/quotations/', body)
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['resource'] })
      navigate('/quotations')
    },
  })

  const set = (key: keyof Quote, next: string) => setValue((old) => ({
    ...old,
    [key]: next || (['valid_until', 'contact_number', 'billing_address', 'notes', 'terms'].includes(key) ? null : ''),
  }))

  const field = (key: keyof Quote, label: string, type = 'text', required = false) => (
    <TextField
      label={label} type={type} required={required} fullWidth
      value={value[key] ?? ''} onChange={(event) => set(key, event.target.value)}
      slotProps={type === 'date' ? { inputLabel: { shrink: true } } : type === 'number' ? { htmlInput: { min: 0, step: '0.01' } } : undefined}
    />
  )

  const subtotal = value.items.reduce((sum, item) => sum + Math.round(Number(item.quantity) * Number(item.unit_price) * 100) / 100, 0)
  const taxable = subtotal - Number(value.discount)
  const total = taxable + Math.round(taxable * Number(value.gst_percent)) / 100

  const handleConvertToOrder = () => {
    // Navigate to in-jobs create with quotation prefill
    navigate('/in-jobs/new', {
      state: {
        customer_name: value.customer_name,
        contact_number: value.contact_number,
        total_amount: total.toFixed(2),
        remarks: `Converted from Quotation ${value.quotation_number || ''}\n${value.notes || ''}`.trim(),
      },
    })
  }

  return (
    <Box>
      {initial.id && previewOpen && (
        <QuotationPreviewModal quoteId={initial.id} onClose={() => setPreviewOpen(false)} />
      )}

      {/* Top action buttons */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button startIcon={<ArrowBackRounded />} onClick={() => navigate('/quotations')}>
          Back to Quotations
        </Button>
        {initial.id && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" startIcon={<VisibilityRounded />} onClick={() => setPreviewOpen(true)}>
              Preview & Print
            </Button>
            <Button
              variant="outlined" startIcon={<DownloadRounded />}
              onClick={async () => {
                const data = await api.get<QuotationData>(`/quotations/${initial.id}/preview-data/`)
                await generateQuotationPDF(data.data)
              }}
            >
              Download PDF
            </Button>
            <Button
              variant="contained" color="success" startIcon={<AddTaskRounded />}
              onClick={handleConvertToOrder}
            >
              Convert to Order
            </Button>
          </Box>
        )}
      </Box>

      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        {value.quotation_number || 'New Quotation'}
      </Typography>

      <Card component="form" sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }} elevation={0} onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
        {save.isError && <Alert severity="error" sx={{ mb: 2 }}>{apiError(save.error)}</Alert>}
        {customers.isError && <Alert severity="warning">Customer autofill is unavailable. You can enter customer details manually.</Alert>}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          <TextField
            select label="Existing customer (optional)" value={value.customer || ''}
            onChange={(event) => {
              const customer = customers.data?.find((item) => item.id === Number(event.target.value))
              setValue((old) => ({
                ...old,
                customer: customer?.id || null,
                ...(customer ? { customer_name: customer.name, contact_number: customer.mobile, billing_address: customer.billing_address } : {}),
              }))
            }}
          >
            <MenuItem value="">Enter manually</MenuItem>
            {value.customer && !customers.data?.some((item) => item.id === value.customer) && (
              <MenuItem value={value.customer}>{value.customer_name} (existing)</MenuItem>
            )}
            {customers.data?.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
          </TextField>
          {field('customer_name', 'Customer name', 'text', true)}
          {field('contact_number', 'Contact number')}
          {field('quotation_date', 'Quotation date', 'date', true)}
          {field('valid_until', 'Valid until', 'date')}
          <TextField select label="Status" value={value.status} onChange={(event) => set('status', event.target.value)}>
            {['draft', 'sent', 'accepted', 'rejected', 'cancelled'].map((status) => (
              <MenuItem key={status} value={status}>{status.toUpperCase()}</MenuItem>
            ))}
          </TextField>
          <Box sx={{ gridColumn: { md: 'span 3' } }}>
            {field('billing_address', 'Billing address')}
          </Box>
        </Box>

        <Typography variant="h6" fontWeight={700} sx={{ mt: 3, mb: 1.5 }}>Line Items</Typography>
        {value.items.map((item, index) => (
          <Box key={index} sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
            <TextField
              label={`Description ${index + 1}`} required
              value={item.description} sx={{ flex: 2, minWidth: 200 }}
              slotProps={{ htmlInput: { maxLength: 500 } }}
              onChange={(e) => setValue((old) => ({ ...old, items: old.items.map((row, p) => p === index ? { ...row, description: e.target.value } : row) }))}
            />
            <TextField
              label="Quantity" required type="number"
              value={item.quantity} sx={{ width: 120 }}
              slotProps={{ htmlInput: { min: '0.01', step: '0.01' } }}
              onChange={(e) => setValue((old) => ({ ...old, items: old.items.map((row, p) => p === index ? { ...row, quantity: e.target.value } : row) }))}
            />
            <TextField
              label="Unit Price (₹)" required type="number"
              value={item.unit_price} sx={{ width: 140 }}
              slotProps={{ htmlInput: { min: '0', step: '0.01' } }}
              onChange={(e) => setValue((old) => ({ ...old, items: old.items.map((row, p) => p === index ? { ...row, unit_price: e.target.value } : row) }))}
            />
            <Typography sx={{ minWidth: 100, fontWeight: 600, color: 'text.secondary' }}>
              = {fmt(Number(item.quantity) * Number(item.unit_price))}
            </Typography>
            <Button color="error" disabled={value.items.length === 1} onClick={() => setValue((old) => ({ ...old, items: old.items.filter((_, p) => p !== index) }))}>
              Remove
            </Button>
          </Box>
        ))}

        <Button variant="outlined" size="small" disabled={value.items.length >= 100} onClick={() => setValue((old) => ({ ...old, items: [...old.items, { description: '', quantity: '1', unit_price: '0' }] }))}>
          + Add item
        </Button>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, my: 2.5 }}>
          <Box sx={{ width: 180 }}>{field('discount', 'Discount amount (₹)', 'number', true)}</Box>
          <Box sx={{ width: 140 }}>{field('gst_percent', 'GST %', 'number', true)}</Box>
        </Box>

        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, my: 2 }}>
          <Typography fontWeight={600}>
            Estimated Subtotal: {fmt(subtotal)} · GST ({value.gst_percent}%): {fmt(total - taxable)} · Total: {fmt(total)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Final totals calculated on server. Status &ldquo;Sent&rdquo; does not automatically email customer.
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gap: 2, my: 2 }}>
          <TextField label="Notes" multiline minRows={2} value={value.notes || ''} onChange={(e) => set('notes', e.target.value)} />
          <TextField label="Terms and conditions" multiline minRows={2} value={value.terms || ''} onChange={(e) => set('terms', e.target.value)} />
        </Box>

        <Button type="submit" variant="contained" size="large" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save quotation'}
        </Button>
      </Card>
    </Box>
  )
}
