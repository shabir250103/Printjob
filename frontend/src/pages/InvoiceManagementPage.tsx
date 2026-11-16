import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Alert, Badge, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  Divider, IconButton, InputAdornment, MenuItem, Pagination, Paper,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import SearchRounded from '@mui/icons-material/SearchRounded'
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded'
import VisibilityRounded from '@mui/icons-material/VisibilityRounded'
import DownloadRounded from '@mui/icons-material/DownloadRounded'
import PrintRounded from '@mui/icons-material/PrintRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import FilterListRounded from '@mui/icons-material/FilterListRounded'
import { api, apiError } from '../api/client'
import { generateInvoicePDF, type InvoiceData } from '../utils/pdf'

type Invoice = {
  id: number
  invoice_no: string
  invoice_date: string
  order_reference: string
  customer_name_snapshot: string
  customer_name: string
  customer_address_snapshot?: string
  customer_gstin_snapshot?: string
  customer_contact_snapshot?: string
  job_number: string
  subtotal: string
  discount: string
  taxable_amount: string
  gst_percent: string
  gst_amount: string
  cgst_amount: string
  sgst_amount: string
  grand_total: string
  amount_in_words: string
  payment_status: string
  is_igst_applicable: boolean
  notes: string
  terms_snapshot: string
  signature_url: string
  authorized_person_snapshot: string
  authorized_designation_snapshot: string
  company_name_snapshot: string
  company_address_snapshot: string
  company_gstin_snapshot: string
  company_contact_snapshot: string
  company_email_snapshot: string
  company_logo_url: string
  in_job: number | null
  out_job: number | null
  delivery_status?: string
}

type InvoicePreviewData = Invoice & {
  line_items: Array<{ description: string; details?: string; quantity: number | string; unit_price: string; amount: string }>
  company: {
    company_name: string; address: string; gstin: string; contact_number: string
    email: string; company_logo_url: string; digital_signature_url: string
    authorized_person_name: string; authorized_person_designation: string
    terms_and_conditions: string; bank_name: string; bank_account_number: string; bank_ifsc: string
  } | null
}

const statusColors: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  paid: 'success', partial: 'warning', unpaid: 'error',
}

const deliveryStatusColors: Record<string, 'success' | 'warning' | 'info' | 'error' | 'default'> = {
  delivered: 'success', dispatched: 'info', ready: 'warning', pending: 'default', failed: 'error',
}

const fmt = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

export function InvoicePreviewDialog({ invoiceId, onClose }: { invoiceId: number; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['invoice-preview', invoiceId],
    queryFn: async () => (await api.get<InvoicePreviewData>(`/invoices/${invoiceId}/preview-data/`)).data,
  })
  const [downloading, setDownloading] = useState(false)

  if (query.isPending) return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogContent sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </DialogContent>
    </Dialog>
  )

  if (query.isError) return (
    <Dialog open onClose={onClose} maxWidth="sm">
      <DialogContent><Alert severity="error">{apiError(query.error)}</Alert></DialogContent>
    </Dialog>
  )

  const inv = query.data!
  const handleDownload = async () => {
    setDownloading(true)
    try {
      await generateInvoicePDF(inv as InvoiceData)
    } finally {
      setDownloading(false)
    }
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return
    const companyName = inv.company?.company_name || inv.company_name_snapshot || 'Company'
    const customerName = inv.customer_name_snapshot || inv.customer_name || ''
    const isIGST = inv.is_igst_applicable
    const halfGst = Number(inv.gst_percent) / 2
    printWindow.document.write(`<!DOCTYPE html><html><head>
      <title>Invoice ${inv.invoice_no}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #222; }
        .header { background: #17212b; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
        .logo { max-height: 60px; max-width: 120px; }
        .company-name { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
        .company-detail { font-size: 10px; color: #ccc; }
        .invoice-badge { background: #ef6c3e; color: white; padding: 6px 18px; border-radius: 4px; font-size: 14px; font-weight: bold; }
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
        .words { padding: 8px 20px; font-size: 10px; color: #555; font-style: italic; }
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
          ${inv.company?.company_logo_url ? `<img class="logo" src="${inv.company.company_logo_url}" />` : ''}
          <div class="company-name">${companyName}</div>
          <div class="company-detail">${inv.company?.address || inv.company_address_snapshot || ''}</div>
          ${inv.company?.gstin || inv.company_gstin_snapshot ? `<div class="company-detail">GSTIN: ${inv.company?.gstin || inv.company_gstin_snapshot}</div>` : ''}
        </div>
        <div class="invoice-badge">TAX INVOICE</div>
      </div>
      <div class="meta-row">
        <span><b>Invoice No:</b> ${inv.invoice_no}</span>
        <span><b>Date:</b> ${inv.invoice_date}</span>
        ${inv.order_reference ? `<span><b>Order Ref:</b> ${inv.order_reference}</span>` : ''}
        <span><b>Payment:</b> ${inv.payment_status?.toUpperCase()}</span>
      </div>
      <div class="parties">
        <div class="party-box">
          <div class="party-label">Bill From</div>
          <div class="party-name">${companyName}</div>
          <div class="party-detail">${(inv.company?.address || inv.company_address_snapshot || '').replace(/\n/g, '<br/>')}</div>
          ${inv.company?.gstin || inv.company_gstin_snapshot ? `<div class="party-detail"><b>GSTIN:</b> ${inv.company?.gstin || inv.company_gstin_snapshot}</div>` : ''}
        </div>
        <div class="party-box">
          <div class="party-label">Bill To</div>
          <div class="party-name">${customerName}</div>
          <div class="party-detail">${(inv.customer_address_snapshot || '').replace(/\n/g, '<br/>')}</div>
          ${inv.customer_gstin_snapshot ? `<div class="party-detail"><b>GSTIN:</b> ${inv.customer_gstin_snapshot}</div>` : ''}
          ${inv.customer_contact_snapshot ? `<div class="party-detail">${inv.customer_contact_snapshot}</div>` : ''}
        </div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Description</th><th class="center">Qty</th><th class="right">Unit Price</th><th class="right">Amount</th></tr></thead>
        <tbody>
          ${(inv.line_items?.length ? inv.line_items : [{ description: 'Printing Services', quantity: 1, unit_price: inv.subtotal, amount: inv.subtotal }])
            .map((item, i) => `<tr><td class="center">${i + 1}</td><td>${item.description}${item.details ? `<br/><small style="color:#888">${item.details}</small>` : ''}</td><td class="center">${item.quantity}</td><td class="right">${fmt(item.unit_price)}</td><td class="right">${fmt(item.amount)}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="summary">
        <div class="summary-row"><span>Subtotal</span><span>${fmt(inv.subtotal)}</span></div>
        ${Number(inv.discount) > 0 ? `<div class="summary-row"><span>Discount</span><span>- ${fmt(inv.discount)}</span></div>` : ''}
        <div class="summary-row"><span>Taxable Amount</span><span>${fmt(inv.taxable_amount)}</span></div>
        ${isIGST
          ? `<div class="summary-row"><span>IGST (${inv.gst_percent}%)</span><span>${fmt(inv.gst_amount)}</span></div>`
          : `<div class="summary-row"><span>CGST (${halfGst}%)</span><span>${fmt(inv.cgst_amount)}</span></div>
             <div class="summary-row"><span>SGST (${halfGst}%)</span><span>${fmt(inv.sgst_amount)}</span></div>`
        }
        <div class="summary-total"><span>Grand Total</span><span>${fmt(inv.grand_total)}</span></div>
      </div>
      <div class="words">Amount in words: ${inv.amount_in_words}</div>
      ${(inv.company?.authorized_person_name || inv.authorized_person_snapshot) ? `
      <div class="sig-box">
        <div class="sig-label">Authorised Signatory</div>
        ${(inv.company?.digital_signature_url || inv.signature_url) ? `<img class="sig-img" src="${inv.company?.digital_signature_url || inv.signature_url}" />` : '<div style="height:40px"></div>'}
        <div class="sig-line"></div>
        <div class="sig-name">${inv.company?.authorized_person_name || inv.authorized_person_snapshot}</div>
        ${(inv.company?.authorized_person_designation || inv.authorized_designation_snapshot) ? `<div class="sig-desig">${inv.company?.authorized_person_designation || inv.authorized_designation_snapshot}</div>` : ''}
      </div>` : ''}
      ${inv.notes ? `<div style="padding: 12px 20px; font-size: 10px; color: #555;"><b>Notes:</b> ${inv.notes}</div>` : ''}
      <div class="footer">
        ${inv.terms_snapshot || inv.company?.terms_and_conditions ? `<div>Terms: ${inv.terms_snapshot || inv.company?.terms_and_conditions}</div>` : ''}
        <div style="margin-top:4px; text-align:center;">This is a computer-generated document.</div>
      </div>
    </body></html>`)
    printWindow.document.close()
    setTimeout(() => { printWindow.print() }, 500)
  }

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { maxHeight: '95vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ReceiptLongRounded color="primary" />
          <Box>
            <Typography variant="h6" fontWeight={700}>{inv.invoice_no}</Typography>
            <Typography variant="caption" color="text.secondary">{inv.invoice_date} · {inv.customer_name_snapshot || inv.customer_name}</Typography>
          </Box>
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
      <DialogContent sx={{ p: 0, overflow: 'auto' }}>
        {/* Invoice Preview */}
        <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 860, mx: 'auto' }}>
          {/* Header */}
          <Box sx={{ bgcolor: '#17212b', color: 'white', p: 2.5, borderRadius: 2, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              {(inv.company?.company_logo_url || inv.company_logo_url) && (
                <Box component="img" src={inv.company?.company_logo_url || inv.company_logo_url} alt="Logo"
                  sx={{ maxHeight: 50, maxWidth: 100, mb: 1, objectFit: 'contain' }} />
              )}
              <Typography fontWeight={800} fontSize={16}>{inv.company?.company_name || inv.company_name_snapshot}</Typography>
              {(inv.company?.address || inv.company_address_snapshot) && (
                <Typography fontSize={11} color="rgba(255,255,255,0.65)" sx={{ whiteSpace: 'pre-line' }}>
                  {inv.company?.address || inv.company_address_snapshot}
                </Typography>
              )}
              {(inv.company?.gstin || inv.company_gstin_snapshot) && (
                <Typography fontSize={11} color="rgba(255,255,255,0.65)">GSTIN: {inv.company?.gstin || inv.company_gstin_snapshot}</Typography>
              )}
            </Box>
            <Box sx={{ bgcolor: 'primary.main', px: 2.5, py: 1, borderRadius: 1 }}>
              <Typography fontWeight={700} fontSize={14}>TAX INVOICE</Typography>
            </Box>
          </Box>

          {/* Meta */}
          <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap' }}>
            <Box><Typography variant="caption" color="text.secondary">Invoice No</Typography><Typography fontWeight={700}>{inv.invoice_no}</Typography></Box>
            <Box><Typography variant="caption" color="text.secondary">Date</Typography><Typography fontWeight={600}>{inv.invoice_date}</Typography></Box>
            {inv.order_reference && <Box><Typography variant="caption" color="text.secondary">Order Ref</Typography><Typography fontWeight={600}>{inv.order_reference}</Typography></Box>}
            <Box><Typography variant="caption" color="text.secondary">Payment</Typography>
              <Chip label={inv.payment_status?.toUpperCase()} color={statusColors[inv.payment_status] || 'default'} size="small" sx={{ ml: 0.5, fontWeight: 700 }} />
            </Box>
          </Box>

          {/* Parties */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 3 }}>
            {[
              { label: 'BILL FROM', name: inv.company?.company_name || inv.company_name_snapshot, address: inv.company?.address || inv.company_address_snapshot, gstin: inv.company?.gstin || inv.company_gstin_snapshot, contact: inv.company?.contact_number || inv.company_contact_snapshot },
              { label: 'BILL TO', name: inv.customer_name_snapshot || inv.customer_name, address: inv.customer_address_snapshot, gstin: inv.customer_gstin_snapshot, contact: inv.customer_contact_snapshot },
            ].map((party) => (
              <Box key={party.label} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                <Typography fontSize={9} fontWeight={700} color="primary.main" textTransform="uppercase" mb={0.5}>{party.label}</Typography>
                <Typography fontWeight={700} mb={0.5}>{party.name}</Typography>
                {party.address && <Typography fontSize={12} color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{party.address}</Typography>}
                {party.gstin && <Typography fontSize={11} mt={0.5}><b>GSTIN:</b> {party.gstin}</Typography>}
                {party.contact && <Typography fontSize={11} color="text.secondary">{party.contact}</Typography>}
              </Box>
            ))}
          </Box>

          {/* Line items */}
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
                {(inv.line_items?.length ? inv.line_items : [{ description: 'Printing Services', quantity: 1, unit_price: inv.subtotal, amount: inv.subtotal }]).map((item, i) => (
                  <TableRow key={i} sx={{ '&:nth-of-type(even)': { bgcolor: 'action.hover' } }}>
                    <TableCell sx={{ width: 40, color: 'text.secondary' }}>{i + 1}</TableCell>
                    <TableCell>
                      <Typography fontSize={12} fontWeight={500}>{item.description}</Typography>
                      {item.details && <Typography fontSize={11} color="text.secondary">{item.details}</Typography>}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>{item.quantity}</TableCell>
                    <TableCell sx={{ textAlign: 'right' }}>{fmt(item.unit_price)}</TableCell>
                    <TableCell sx={{ textAlign: 'right', fontWeight: 600 }}>{fmt(item.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          {/* Summary + Signature */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
            {/* Signature */}
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, textAlign: 'center' }}>
              <Typography fontSize={9} fontWeight={700} color="primary.main" textTransform="uppercase" mb={1}>Authorised Signatory</Typography>
              {(inv.company?.digital_signature_url || inv.signature_url) && (
                <Box component="img" src={inv.company?.digital_signature_url || inv.signature_url} alt="Signature"
                  sx={{ maxWidth: 160, maxHeight: 60, mb: 1 }} />
              )}
              <Divider />
              <Typography fontWeight={700} fontSize={12} mt={1}>{inv.company?.authorized_person_name || inv.authorized_person_snapshot}</Typography>
              <Typography fontSize={11} color="text.secondary">{inv.company?.authorized_person_designation || inv.authorized_designation_snapshot}</Typography>
            </Box>

            {/* Totals */}
            <Box>
              {[
                ['Subtotal', fmt(inv.subtotal)],
                ...(Number(inv.discount) > 0 ? [['Discount', `− ${fmt(inv.discount)}`]] : []),
                ['Taxable Amount', fmt(inv.taxable_amount)],
                ...(inv.is_igst_applicable
                  ? [[`IGST (${inv.gst_percent}%)`, fmt(inv.gst_amount)]]
                  : [
                      [`CGST (${Number(inv.gst_percent) / 2}%)`, fmt(inv.cgst_amount)],
                      [`SGST (${Number(inv.gst_percent) / 2}%)`, fmt(inv.sgst_amount)],
                    ]
                ),
              ].map(([label, value]) => (
                <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, px: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography fontSize={12} color="text.secondary">{label}</Typography>
                  <Typography fontSize={12} fontWeight={500}>{value}</Typography>
                </Box>
              ))}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1.2, px: 1.5, bgcolor: 'primary.main', borderRadius: '0 0 8px 8px', color: 'white' }}>
                <Typography fontWeight={800} fontSize={14}>Grand Total</Typography>
                <Typography fontWeight={800} fontSize={14}>{fmt(inv.grand_total)}</Typography>
              </Box>
              <Typography fontSize={11} color="text.secondary" fontStyle="italic" mt={1} px={1.5}>
                {inv.amount_in_words}
              </Typography>
            </Box>
          </Box>

          {/* Notes */}
          {inv.notes && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Typography fontSize={11} fontWeight={600} mb={0.5}>Notes</Typography>
              <Typography fontSize={11} color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{inv.notes}</Typography>
            </Box>
          )}
          {(inv.terms_snapshot || inv.company?.terms_and_conditions) && (
            <Box sx={{ mt: 1.5, p: 2, bgcolor: '#17212b', borderRadius: 2 }}>
              <Typography fontSize={10} color="rgba(255,255,255,0.5)">Terms & Conditions</Typography>
              <Typography fontSize={11} color="rgba(255,255,255,0.75)" sx={{ whiteSpace: 'pre-line', mt: 0.5 }}>
                {inv.terms_snapshot || inv.company?.terms_and_conditions}
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  )
}

const PAGE_SIZE = 15

export function InvoiceManagementPage() {
  const [search, setSearch] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [deliveryStatus, setDeliveryStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const params: Record<string, string | number> = { page, page_size: PAGE_SIZE }
  if (search) params.search = search
  if (paymentStatus) params.payment_status = paymentStatus
  if (deliveryStatus) params.delivery_status = deliveryStatus
  if (dateFrom) params.date_from = dateFrom
  if (dateTo) params.date_to = dateTo

  const query = useQuery({
    queryKey: ['invoices', params],
    queryFn: async () => {
      const res = await api.get<Invoice[] | { results: Invoice[]; count: number }>('/invoices/', { params })
      const data = res.data
      if (Array.isArray(data)) {
        return { results: data, count: data.length, isRawArray: true }
      }
      return { results: data?.results ?? [], count: data?.count ?? 0, isRawArray: false }
    },
  })

  const allInvoices = query.data?.results ?? []
  const totalCount = query.data?.count ?? 0
  const displayedInvoices = query.data?.isRawArray
    ? allInvoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : allInvoices

  const activeFilters = [paymentStatus, deliveryStatus, dateFrom, dateTo].filter(Boolean).length

  return (
    <Box>
      {previewId && <InvoicePreviewDialog invoiceId={previewId} onClose={() => setPreviewId(null)} />}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: 'primary.main', color: 'white', display: 'flex' }}>
          <ReceiptLongRounded />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>Invoice Management</Typography>
          <Typography variant="body2" color="text.secondary">All generated invoices · auto-created on delivery</Typography>
        </Box>
      </Box>

      {/* Toolbar */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small" placeholder="Search invoices, orders, customers…"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          sx={{ minWidth: 280 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }}
        />
        <Tooltip title="Filters">
          <IconButton
            onClick={() => setShowFilters(v => !v)}
            sx={{ border: '1px solid', borderColor: activeFilters ? 'primary.main' : 'divider', borderRadius: 1.5 }}
          >
            <Badge badgeContent={activeFilters} color="primary">
              <FilterListRounded />
            </Badge>
          </IconButton>
        </Tooltip>
      </Box>

      {/* Filters panel */}
      {showFilters && (
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
          <TextField select label="Payment Status" size="small" value={paymentStatus} onChange={e => { setPaymentStatus(e.target.value); setPage(1) }} sx={{ minWidth: 150 }}>
            <MenuItem value="">All Payments</MenuItem>
            <MenuItem value="paid">Paid</MenuItem>
            <MenuItem value="partial">Partial</MenuItem>
            <MenuItem value="unpaid">Unpaid</MenuItem>
          </TextField>
          <TextField select label="Delivery Status" size="small" value={deliveryStatus} onChange={e => { setDeliveryStatus(e.target.value); setPage(1) }} sx={{ minWidth: 150 }}>
            <MenuItem value="">All Deliveries</MenuItem>
            <MenuItem value="delivered">Delivered</MenuItem>
            <MenuItem value="dispatched">Dispatched</MenuItem>
            <MenuItem value="ready">Ready</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
          </TextField>
          <TextField label="From Date" type="date" size="small" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="To Date" type="date" size="small" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} slotProps={{ inputLabel: { shrink: true } }} />
          <Button variant="text" onClick={() => { setPaymentStatus(''); setDeliveryStatus(''); setDateFrom(''); setDateTo(''); setPage(1) }}>Clear</Button>
        </Box>
      )}

      {/* Table */}
      {query.isError && <Alert severity="error">{apiError(query.error)}</Alert>}

      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f5f3ef' }}>
            <TableRow>
              {['Invoice No', 'Date', 'Order Ref', 'Customer', 'Amount', 'GST', 'Grand Total', 'Payment', 'Delivery', 'Actions'].map(h => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, py: 1.5 }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {query.isPending ? (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={28} />
                </TableCell>
              </TableRow>
            ) : displayedInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  <ReceiptLongRounded sx={{ fontSize: 40, mb: 1, display: 'block', mx: 'auto', opacity: 0.3 }} />
                  No invoices found
                </TableCell>
              </TableRow>
            ) : displayedInvoices.map((inv) => (
              <TableRow key={inv.id} hover sx={{ cursor: 'pointer' }} onClick={() => setPreviewId(inv.id)}>
                <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>{inv.invoice_no}</TableCell>
                <TableCell>{inv.invoice_date}</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{inv.order_reference || '—'}</TableCell>
                <TableCell>{inv.customer_name_snapshot || inv.customer_name || '—'}</TableCell>
                <TableCell>{fmt(inv.subtotal)}</TableCell>
                <TableCell>{fmt(inv.gst_amount)} <Typography component="span" fontSize={10} color="text.secondary">({inv.gst_percent}%)</Typography></TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{fmt(inv.grand_total)}</TableCell>
                <TableCell>
                  <Chip label={inv.payment_status?.toUpperCase()} color={statusColors[inv.payment_status] || 'default'} size="small" sx={{ fontWeight: 700 }} />
                </TableCell>
                <TableCell>
                  <Chip
                    label={(inv.delivery_status || 'delivered').toUpperCase()}
                    color={deliveryStatusColors[inv.delivery_status || 'delivered'] || 'default'}
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: 700 }}
                  />
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="Preview / Print">
                      <IconButton size="small" color="primary" onClick={() => setPreviewId(inv.id)}><VisibilityRounded fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Download PDF">
                      <IconButton size="small" color="secondary" onClick={async () => {
                        const data = await api.get<InvoiceData>(`/invoices/${inv.id}/preview-data/`)
                        await generateInvoicePDF(data.data)
                      }}><DownloadRounded fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Print">
                      <IconButton size="small" onClick={() => setPreviewId(inv.id)}><PrintRounded fontSize="small" /></IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {/* Pagination */}
      {totalCount > PAGE_SIZE && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={Math.ceil(totalCount / PAGE_SIZE)} page={page}
            onChange={(_, v) => setPage(v)} color="primary"
          />
        </Box>
      )}
    </Box>
  )
}
