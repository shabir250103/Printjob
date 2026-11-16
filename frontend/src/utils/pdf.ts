/**
 * PDF generation utility for invoices and quotations.
 * Uses jsPDF + jspdf-autotable (both already installed).
 * Generates professional A4 GST-compliant documents.
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface CompanyInfo {
  company_name: string
  address: string
  gstin: string
  contact_number: string
  email: string
  company_logo_url?: string
  digital_signature_url?: string
  authorized_person_name: string
  authorized_person_designation: string
  terms_and_conditions: string
  bank_name?: string
  bank_account_number?: string
  bank_ifsc?: string
}

export interface InvoiceLineItem {
  description: string
  details?: string
  quantity: number | string
  unit_price: string | number
  amount: string | number
}

export interface InvoiceData {
  invoice_no: string
  invoice_date: string
  order_reference?: string
  customer_name_snapshot?: string
  customer_name?: string
  customer_address_snapshot?: string
  customer_gstin_snapshot?: string
  customer_contact_snapshot?: string
  subtotal: string | number
  discount: string | number
  taxable_amount: string | number
  gst_percent: string | number
  gst_amount: string | number
  cgst_amount: string | number
  sgst_amount: string | number
  grand_total: string | number
  amount_in_words: string
  payment_status: string
  is_igst_applicable: boolean
  notes?: string
  terms_snapshot?: string
  authorized_person_snapshot?: string
  authorized_designation_snapshot?: string
  signature_url?: string
  company_logo_url?: string
  company_name_snapshot?: string
  company_address_snapshot?: string
  company_gstin_snapshot?: string
  company_contact_snapshot?: string
  company_email_snapshot?: string
  line_items?: InvoiceLineItem[]
  company?: CompanyInfo | null
}

export interface QuotationItem {
  description: string
  quantity: string | number
  unit_price: string | number
}

export interface QuotationData {
  quotation_number: string
  quotation_date: string
  valid_until?: string | null
  status: string
  customer_name: string
  contact_number?: string | null
  billing_address?: string | null
  items: QuotationItem[]
  discount: string | number
  gst_percent: string | number
  totals?: {
    subtotal: string
    taxable_amount: string
    gst_amount: string
    grand_total: string
  }
  notes?: string | null
  terms?: string | null
  company?: CompanyInfo | null
}

// Colors
const PRIMARY = [239, 108, 62] as [number, number, number]   // #EF6C3E (brand orange)
const DARK = [23, 33, 43] as [number, number, number]         // #17212B (sidebar)
const LIGHT_GRAY = [248, 248, 248] as [number, number, number]
const MID_GRAY = [220, 220, 220] as [number, number, number]

const fmt = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (v: string | number) => `${Number(v).toFixed(2)}%`

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function getImageFormat(dataUrl: string): string {
  if (dataUrl.includes('image/png')) return 'PNG'
  if (dataUrl.includes('image/jpg') || dataUrl.includes('image/jpeg')) return 'JPEG'
  return 'PNG'
}

function addCompanyHeader(doc: jsPDF, company: CompanyInfo | null | undefined, logoBase64: string | null) {
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header background
  doc.setFillColor(...DARK)
  doc.rect(0, 0, pageWidth, 38, 'F')

  let xLogo = 14
  if (logoBase64) {
    try {
      const fmt = getImageFormat(logoBase64)
      doc.addImage(logoBase64, fmt, 14, 4, 30, 30)
      xLogo = 48
    } catch {
      // skip logo if error
    }
  }

  // Company name
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  const name = company?.company_name || 'Company Name'
  doc.text(name, xLogo, 14)

  // Company details
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(200, 200, 200)
  const details = [
    company?.address || '',
    company?.gstin ? `GSTIN: ${company.gstin}` : '',
    [company?.contact_number, company?.email].filter(Boolean).join(' | '),
  ].filter(Boolean)
  let yDetail = 20
  for (const line of details) {
    doc.text(line, xLogo, yDetail)
    yDetail += 4.5
  }
  doc.setTextColor(0, 0, 0)
}

function addInvoiceTitle(doc: jsPDF, title: string, number: string, date: string) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const y = 46

  // Title box on right
  doc.setFillColor(...PRIMARY)
  doc.roundedRect(pageWidth - 80, y - 2, 76, 14, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(title, pageWidth - 42, y + 7, { align: 'center' })

  // Number and date on left
  doc.setTextColor(...DARK)
  doc.setFontSize(10)
  doc.text(`${number}`, 14, y + 5)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(`Date: ${date}`, 14, y + 11)
}

function addPartyBox(doc: jsPDF, label: string, name: string, address: string, gstin: string, contact: string, x: number, y: number, w: number) {
  doc.setFillColor(...LIGHT_GRAY)
  doc.roundedRect(x, y, w, 36, 2, 2, 'F')
  doc.setDrawColor(...MID_GRAY)
  doc.roundedRect(x, y, w, 36, 2, 2, 'S')

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PRIMARY)
  doc.text(label, x + 3, y + 5)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text(name, x + 3, y + 11, { maxWidth: w - 6 })

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  const lines = doc.splitTextToSize(address, w - 6)
  doc.text(lines.slice(0, 3), x + 3, y + 18)

  if (gstin) {
    doc.setFont('helvetica', 'bold')
    doc.text(`GSTIN: ${gstin}`, x + 3, y + 31)
    doc.setFont('helvetica', 'normal')
  }
  if (contact) {
    doc.text(contact, x + 3, gstin ? y + 35 : y + 31)
  }
}

function addSummaryTable(doc: jsPDF, data: InvoiceData, startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const summaryX = pageWidth - 95
  const colW = 48

  const rows: [string, string][] = [
    ['Subtotal', fmt(data.subtotal)],
  ]
  if (Number(data.discount) > 0) rows.push(['Discount', `- ${fmt(data.discount)}`])
  rows.push(['Taxable Amount', fmt(data.taxable_amount)])

  if (data.is_igst_applicable) {
    rows.push([`IGST (${pct(data.gst_percent)})`, fmt(data.gst_amount)])
  } else {
    const halfPct = Number(data.gst_percent) / 2
    rows.push([`CGST (${pct(halfPct)})`, fmt(data.cgst_amount)])
    rows.push([`SGST (${pct(halfPct)})`, fmt(data.sgst_amount)])
  }

  let y = startY
  for (const [label, value] of rows) {
    doc.setFillColor(252, 252, 252)
    doc.rect(summaryX, y, colW, 6, 'F')
    doc.rect(summaryX + colW, y, colW, 6, 'F')
    doc.setDrawColor(...MID_GRAY)
    doc.rect(summaryX, y, colW, 6, 'S')
    doc.rect(summaryX + colW, y, colW, 6, 'S')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    doc.text(label, summaryX + 2, y + 4)
    doc.text(value, summaryX + colW * 2 - 2, y + 4, { align: 'right' })
    y += 6
  }

  // Grand total row
  doc.setFillColor(...PRIMARY)
  doc.rect(summaryX, y, colW * 2, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Grand Total', summaryX + 2, y + 5.5)
  doc.text(fmt(data.grand_total), summaryX + colW * 2 - 2, y + 5.5, { align: 'right' })
  y += 8

  // Amount in words
  doc.setTextColor(60, 60, 60)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  const wordsText = `Amount in words: ${data.amount_in_words}`
  doc.text(wordsText, 14, y + 4, { maxWidth: summaryX - 20 })

  return y + 10
}

async function addSignatureSection(
  doc: jsPDF, 
  sigBase64: string | null,
  authorizedName: string,
  designation: string,
  startY: number
) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const sigX = pageWidth - 76
  const sigW = 72

  doc.setDrawColor(...MID_GRAY)
  doc.setFillColor(250, 250, 250)
  doc.roundedRect(sigX, startY, sigW, 32, 2, 2, 'FS')

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PRIMARY)
  doc.text('AUTHORISED SIGNATORY', sigX + sigW / 2, startY + 4, { align: 'center' })

  if (sigBase64) {
    try {
      const imgFmt = getImageFormat(sigBase64)
      doc.addImage(sigBase64, imgFmt, sigX + 8, startY + 7, 56, 14)
    } catch {
      // Skip if error
    }
  }

  doc.setDrawColor(...MID_GRAY)
  doc.line(sigX + 4, startY + 25, sigX + sigW - 4, startY + 25)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text(authorizedName, sigX + sigW / 2, startY + 29, { align: 'center' })
  if (designation) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(designation, sigX + sigW / 2, startY + 33, { align: 'center' })
  }
}

function addFooter(doc: jsPDF, terms: string) {
  const pageHeight = doc.internal.pageSize.getHeight()
  const pageWidth = doc.internal.pageSize.getWidth()
  const y = pageHeight - 20

  doc.setFillColor(...DARK)
  doc.rect(0, y, pageWidth, 20, 'F')
  doc.setTextColor(180, 180, 180)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  if (terms) {
    const termsLines = doc.splitTextToSize(`Terms: ${terms}`, pageWidth - 28)
    doc.text(termsLines.slice(0, 2), 14, y + 6)
  }
  doc.setTextColor(100, 100, 100)
  doc.text('This is a computer-generated document.', pageWidth / 2, y + 16, { align: 'center' })
}

export async function generateInvoicePDF(invoiceData: InvoiceData): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const company = invoiceData.company

  // Load images in parallel
  const logoUrl = company?.company_logo_url || invoiceData.company_logo_url || ''
  const sigUrl = company?.digital_signature_url || invoiceData.signature_url || ''
  const [logoBase64, sigBase64] = await Promise.all([
    logoUrl ? loadImageAsBase64(logoUrl) : Promise.resolve(null),
    sigUrl ? loadImageAsBase64(sigUrl) : Promise.resolve(null),
  ])

  // 1. Company header
  addCompanyHeader(doc, company || null, logoBase64)

  // 2. Invoice title bar
  addInvoiceTitle(doc, 'TAX INVOICE', invoiceData.invoice_no, invoiceData.invoice_date)

  // 3. Party boxes
  const companyName = company?.company_name || invoiceData.company_name_snapshot || ''
  const companyAddr = company?.address || invoiceData.company_address_snapshot || ''
  const companyGstin = company?.gstin || invoiceData.company_gstin_snapshot || ''
  const companyContact = company?.contact_number || invoiceData.company_contact_snapshot || ''

  const customerName = invoiceData.customer_name_snapshot || invoiceData.customer_name || ''
  const customerAddr = invoiceData.customer_address_snapshot || ''
  const customerGstin = invoiceData.customer_gstin_snapshot || ''
  const customerContact = invoiceData.customer_contact_snapshot || ''

  const boxW = (pageWidth - 30) / 2
  addPartyBox(doc, 'BILL FROM', companyName, companyAddr, companyGstin, companyContact, 14, 68, boxW)
  addPartyBox(doc, 'BILL TO', customerName, customerAddr, customerGstin, customerContact, 14 + boxW + 4, 68, boxW)

  // 4. Order reference
  let y = 112
  if (invoiceData.order_reference) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    doc.text(`Order Reference: ${invoiceData.order_reference}`, 14, y)
    y += 6
  }
  if (invoiceData.payment_status) {
    const statusColors: Record<string, [number, number, number]> = {
      paid: [46, 160, 67], partial: [210, 140, 0], unpaid: [220, 60, 60],
    }
    const color = statusColors[invoiceData.payment_status] || [100, 100, 100]
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...color)
    doc.text(`Payment Status: ${invoiceData.payment_status.toUpperCase()}`, 14, y)
    y += 6
  }
  y += 2

  // 5. Line items table
  const lineItems = invoiceData.line_items?.length ? invoiceData.line_items : [{
    description: 'Printing Services',
    details: invoiceData.order_reference || '',
    quantity: 1,
    unit_price: invoiceData.subtotal,
    amount: invoiceData.subtotal,
  }]

  autoTable(doc, {
    startY: y,
    head: [['#', 'Description', 'Qty', 'Unit Price', 'Amount']],
    body: lineItems.map((item, i) => [
      i + 1,
      item.details ? `${item.description}\n${item.details}` : item.description,
      item.quantity,
      fmt(item.unit_price),
      fmt(item.amount),
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 32, halign: 'right' },
      4: { cellWidth: 32, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  })

  // 6. Summary + signature
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableEndY = (doc as any).lastAutoTable.finalY + 6

  const summaryEnd = addSummaryTable(doc, invoiceData, tableEndY)

  const sigName = company?.authorized_person_name || invoiceData.authorized_person_snapshot || ''
  const sigDesig = company?.authorized_person_designation || invoiceData.authorized_designation_snapshot || ''
  await addSignatureSection(doc, sigBase64, sigName, sigDesig, tableEndY)

  // 7. Footer
  const terms = company?.terms_and_conditions || invoiceData.terms_snapshot || ''
  addFooter(doc, terms)

  // 8. Bank details (if available)
  if (company?.bank_name || company?.bank_account_number) {
    const bY = summaryEnd + 4
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text('Bank Details:', 14, bY)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    if (company.bank_name) doc.text(`Bank: ${company.bank_name}`, 14, bY + 4)
    if (company.bank_account_number) doc.text(`Account: ${company.bank_account_number}`, 14, bY + 8)
    if (company.bank_ifsc) doc.text(`IFSC: ${company.bank_ifsc}`, 14, bY + 12)
  }

  doc.save(`Invoice_${invoiceData.invoice_no}.pdf`)
}


export async function generateQuotationPDF(quotationData: QuotationData): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const company = quotationData.company

  const logoUrl = company?.company_logo_url || ''
  const sigUrl = company?.digital_signature_url || ''
  const [logoBase64, sigBase64] = await Promise.all([
    logoUrl ? loadImageAsBase64(logoUrl) : Promise.resolve(null),
    sigUrl ? loadImageAsBase64(sigUrl) : Promise.resolve(null),
  ])

  // Header
  addCompanyHeader(doc, company || null, logoBase64)

  // Title
  addInvoiceTitle(doc, 'QUOTATION', quotationData.quotation_number, quotationData.quotation_date)

  // Customer box
  const boxW = (pageWidth - 30) / 2
  addPartyBox(
    doc, 'QUOTED TO',
    quotationData.customer_name,
    quotationData.billing_address || '',
    '',
    quotationData.contact_number || '',
    14, 68, boxW
  )

  // Quote details
  doc.setFillColor(...LIGHT_GRAY)
  doc.roundedRect(14 + boxW + 4, 68, boxW, 36, 2, 2, 'F')
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  const details = [
    ['Quotation No', quotationData.quotation_number],
    ['Date', quotationData.quotation_date],
    ['Valid Until', quotationData.valid_until || 'Not specified'],
    ['Status', quotationData.status.toUpperCase()],
  ]
  let dY = 76
  for (const [label, value] of details) {
    doc.setFont('helvetica', 'bold')
    doc.text(label + ':', 14 + boxW + 8, dY)
    doc.setFont('helvetica', 'normal')
    doc.text(value, 14 + boxW + 8 + 28, dY)
    dY += 6
  }

  // Items table
  const totals = quotationData.totals
  const subtotal = Number(totals?.subtotal || 0)
  const discount = Number(quotationData.discount || 0)
  const gstPct = Number(quotationData.gst_percent || 0)
  const taxable = subtotal - discount
  const gstAmt = Math.round(taxable * gstPct) / 100
  const grandTotal = taxable + gstAmt
  const cgst = Math.round(gstAmt * 50) / 100
  const sgst = gstAmt - cgst

  autoTable(doc, {
    startY: 112,
    head: [['#', 'Description', 'Qty', 'Unit Price', 'Amount']],
    body: quotationData.items.map((item, i) => [
      i + 1,
      item.description,
      item.quantity,
      fmt(item.unit_price),
      fmt(Number(item.quantity) * Number(item.unit_price)),
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 32, halign: 'right' },
      4: { cellWidth: 32, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableEndY = (doc as any).lastAutoTable.finalY + 6
  const summaryX = pageWidth - 95
  const colW = 48

  const summaryRows: [string, string][] = [
    ['Subtotal', fmt(subtotal)],
    ...(discount > 0 ? [['Discount', `- ${fmt(discount)}`] as [string, string]] : []),
    ['Taxable Amount', fmt(taxable)],
    [`CGST (${pct(gstPct / 2)})`, fmt(cgst)],
    [`SGST (${pct(gstPct / 2)})`, fmt(sgst)],
  ]

  let sy = tableEndY
  for (const [label, value] of summaryRows) {
    doc.setFillColor(252, 252, 252)
    doc.rect(summaryX, sy, colW, 6, 'F')
    doc.rect(summaryX + colW, sy, colW, 6, 'F')
    doc.setDrawColor(...MID_GRAY)
    doc.rect(summaryX, sy, colW, 6, 'S')
    doc.rect(summaryX + colW, sy, colW, 6, 'S')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    doc.text(label, summaryX + 2, sy + 4)
    doc.text(value, summaryX + colW * 2 - 2, sy + 4, { align: 'right' })
    sy += 6
  }

  doc.setFillColor(...PRIMARY)
  doc.rect(summaryX, sy, colW * 2, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Grand Total', summaryX + 2, sy + 5.5)
  doc.text(fmt(grandTotal), summaryX + colW * 2 - 2, sy + 5.5, { align: 'right' })

  // Signature
  const sigName = company?.authorized_person_name || ''
  const sigDesig = company?.authorized_person_designation || ''
  await addSignatureSection(doc, sigBase64, sigName, sigDesig, tableEndY)

  // Notes
  if (quotationData.notes) {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text('Notes:', 14, sy + 12)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    const noteLines = doc.splitTextToSize(quotationData.notes, pageWidth - 100)
    doc.text(noteLines.slice(0, 3), 14, sy + 17)
  }

  addFooter(doc, company?.terms_and_conditions || quotationData.terms || '')
  doc.save(`Quotation_${quotationData.quotation_number}.pdf`)
}
