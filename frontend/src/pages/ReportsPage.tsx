import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import AssessmentRounded from '@mui/icons-material/AssessmentRounded'
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded'
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded'
import TableChartRounded from '@mui/icons-material/TableChartRounded'
import PrintRounded from '@mui/icons-material/PrintRounded'
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded'
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded'
import AccountBalanceWalletRounded from '@mui/icons-material/AccountBalanceWalletRounded'
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded'
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded'
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded'
import DeleteSweepRounded from '@mui/icons-material/DeleteSweepRounded'
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import PaymentsRounded from '@mui/icons-material/PaymentsRounded'
import FactoryRounded from '@mui/icons-material/FactoryRounded'
import RefreshRounded from '@mui/icons-material/RefreshRounded'
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded'
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded'
import AccountBalanceRounded from '@mui/icons-material/AccountBalanceRounded'

import { api, apiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/PageHeader'
import {
  exportComprehensiveWorkbookToExcel,
  exportReportToExcel,
  exportReportToPdf,
  type ReportTableColumn,
} from '../utils/reportExport'

type DatePreset = 'all' | 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_quarter' | 'custom'

function getDateRange(preset: DatePreset, customStart: string, customEnd: string): { start: string; end: string } {
  if (preset === 'custom') return { start: customStart, end: customEnd }
  const now = new Date()
  const toStr = (d: Date) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  if (preset === 'today') {
    const s = toStr(now)
    return { start: s, end: s }
  }
  if (preset === 'this_week') {
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const mon = new Date(now)
    mon.setDate(diff)
    return { start: toStr(mon), end: toStr(new Date()) }
  }
  if (preset === 'this_month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    return { start: toStr(first), end: toStr(new Date()) }
  }
  if (preset === 'last_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last = new Date(now.getFullYear(), now.getMonth(), 0)
    return { start: toStr(first), end: toStr(last) }
  }
  if (preset === 'this_quarter') {
    const quarter = Math.floor(now.getMonth() / 3)
    const first = new Date(now.getFullYear(), quarter * 3, 1)
    return { start: toStr(first), end: toStr(new Date()) }
  }
  return { start: '', end: '' }
}

function fmtMoney(val: unknown): string {
  const num = Number(val || 0)
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function humanize(val: unknown): string {
  return String(val ?? '—').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

interface TabConfig {
  title: string
  subtitle: string
  columns: ReportTableColumn[]
  rows: Array<Record<string, unknown>>
  filename: string
}

export function ReportsPage() {
  const { canShowPayments } = useAuth()
  const [activeTab, setActiveTab] = useState<'overview' | 'in_jobs' | 'out_jobs' | 'collections' | 'vendor_payments' | 'customers' | 'deliveries' | 'stock' | 'wastage' | 'counters'>('overview')
  const [datePreset, setDatePreset] = useState<DatePreset>('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [tableSearch, setTableSearch] = useState('')
  const [page, setPage] = useState(0)
  const rowsPerPage = 15

  const { start, end } = useMemo(() => getDateRange(datePreset, customStart, customEnd), [datePreset, customStart, customEnd])

  const reportQuery = useQuery({
    queryKey: ['reports-comprehensive', start, end],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (start) params.set('from', start)
      if (end) params.set('to', end)
      const res = await api.get(`/reports/comprehensive/?${params.toString()}`)
      return res.data
    },
  })

  const data = reportQuery.data
  const kpis = data?.kpis || {}
  const periodText = data?.period?.from && data?.period?.to ? `${data.period.from} to ${data.period.to}` : 'All time'

  // Columns & data mapping per tab
  const tabConfig = useMemo<TabConfig | null>(() => {
    switch (activeTab) {
      case 'in_jobs': {
        const baseCols: ReportTableColumn[] = [
          { header: 'Job No', key: 'job_number' },
          { header: 'Customer', key: 'customer_name' },
          { header: 'Job Type', key: 'job_type' },
          { header: 'Priority', key: 'priority' },
          { header: 'Printing', key: 'printing_status' },
          { header: 'Finishing', key: 'finishing_status' },
          { header: 'Sheets', key: 'sheet_count', align: 'right' },
          { header: 'Clicks', key: 'click_count', align: 'right' },
          { header: 'Job Date', key: 'job_date' },
          { header: 'Delivery', key: 'delivery_date' },
        ]
        if (canShowPayments) {
          baseCols.push(
            { header: 'Total (₹)', key: 'total_amount', align: 'right' },
            { header: 'Advance (₹)', key: 'advance', align: 'right' },
            { header: 'Balance (₹)', key: 'balance', align: 'right' },
            { header: 'Status', key: 'payment_status' },
          )
        }
        return {
          title: 'In-House Production Jobs',
          subtitle: 'Detailed ledger of print jobs processed internally including impressions and finishing status.',
          columns: baseCols,
          rows: (data?.in_jobs || []) as Array<Record<string, unknown>>,
          filename: 'In_House_Jobs_Report',
        }
      }
      case 'out_jobs': {
        const baseCols: ReportTableColumn[] = [
          { header: 'Job No', key: 'job_number' },
          { header: 'Customer', key: 'customer_name' },
          { header: 'Vendor / Partner', key: 'vendor_name' },
          { header: 'Priority', key: 'priority' },
          { header: 'Status', key: 'status' },
          { header: 'Quantity', key: 'quantity', align: 'right' },
          { header: 'Delivery Date', key: 'delivery_date' },
        ]
        if (canShowPayments) {
          baseCols.push(
            { header: 'Customer Price', key: 'total_amount', align: 'right' },
            { header: 'Vendor Cost', key: 'vendor_cost', align: 'right' },
            { header: 'Profit (₹)', key: 'profit', align: 'right' },
            { header: 'Cust. Payment', key: 'payment_status' },
            { header: 'Vendor Payment', key: 'vendor_payment_status' },
          )
        }
        return {
          title: 'Out-Jobs & Vendor Outsourcing',
          subtitle: 'Jobs outsourced to commercial printing partners with cost and fulfillment progress.',
          columns: baseCols,
          rows: (data?.out_jobs || []) as Array<Record<string, unknown>>,
          filename: 'Out_Jobs_Report',
        }
      }
      case 'collections': {
        const cols: ReportTableColumn[] = [
          { header: 'Receipt No', key: 'payment_number' },
          { header: 'Customer', key: 'customer_name' },
          { header: 'Job Number', key: 'job_number' },
          { header: 'Job Type', key: 'job_type' },
          { header: 'Payment Date', key: 'payment_date' },
          { header: 'Method', key: 'payment_method' },
          { header: 'Reference', key: 'reference' },
          { header: 'Amount (₹)', key: 'amount', align: 'right' },
        ]
        return {
          title: 'Customer Payments & Receipts',
          subtitle: 'Audit log of cash, UPI, bank, and cheque receipts collected from customers.',
          columns: cols,
          rows: (data?.customer_payments || []) as Array<Record<string, unknown>>,
          filename: 'Customer_Collections_Report',
        }
      }
      case 'vendor_payments': {
        const cols: ReportTableColumn[] = [
          { header: 'Voucher No', key: 'payment_number' },
          { header: 'Vendor / Supplier', key: 'supplier_name' },
          { header: 'Out Job Ref', key: 'out_job_number' },
          { header: 'Payment Date', key: 'payment_date' },
          { header: 'Method', key: 'payment_method' },
          { header: 'Reference', key: 'reference' },
          { header: 'Amount (₹)', key: 'amount', align: 'right' },
        ]
        return {
          title: 'Vendor & Supplier Outflows',
          subtitle: 'Payments disbursed to paper suppliers, die-makers, binders, and outsource vendors.',
          columns: cols,
          rows: (data?.vendor_payments || []) as Array<Record<string, unknown>>,
          filename: 'Vendor_Disbursements_Report',
        }
      }
      case 'customers': {
        const baseCols: ReportTableColumn[] = [
          { header: 'Customer Name', key: 'name' },
          { header: 'Contact', key: 'phone' },
          { header: 'Total Orders', key: 'total_jobs', align: 'right' },
        ]
        if (canShowPayments) {
          baseCols.push(
            { header: 'Total Billed (₹)', key: 'total_billed', align: 'right' },
            { header: 'Total Paid (₹)', key: 'total_paid', align: 'right' },
            { header: 'Outstanding Balance (₹)', key: 'outstanding_balance', align: 'right' },
          )
        }
        return {
          title: 'Customer Accounts & Aging Receivables',
          subtitle: 'Aggregated client volume, billing history, and current outstanding credit balance.',
          columns: baseCols,
          rows: (data?.customers || []) as Array<Record<string, unknown>>,
          filename: 'Customer_Accounts_Report',
        }
      }
      case 'deliveries': {
        const cols: ReportTableColumn[] = [
          { header: 'Job Number', key: 'job_number' },
          { header: 'Customer', key: 'customer_name' },
          { header: 'Destination', key: 'delivery_address' },
          { header: 'Method', key: 'delivery_method' },
          { header: 'Delivery Status', key: 'status' },
          { header: 'Date', key: 'delivery_date' },
          { header: 'Notes', key: 'driver_notes' },
        ]
        return {
          title: 'Deliveries & Logistics Audit',
          subtitle: 'Delivery status, courier tracking, hand receipts, and delivery fees.',
          columns: cols,
          rows: (data?.deliveries || []) as Array<Record<string, unknown>>,
          filename: 'Deliveries_Logistics_Report',
        }
      }
      case 'stock': {
        const cols: ReportTableColumn[] = [
          { header: 'Item Name', key: 'name' },
          { header: 'Category', key: 'category' },
          { header: 'Current Stock', key: 'current_stock', align: 'right' },
          { header: 'Min Threshold', key: 'min_stock', align: 'right' },
          { header: 'Unit', key: 'unit' },
          { header: 'Status', key: 'is_low_stock' },
        ]
        return {
          title: 'Inventory & Paper Stock Health',
          subtitle: 'Warehouse inventory status, current levels, and low-stock reorder thresholds.',
          columns: cols,
          rows: (data?.stock_items || []) as Array<Record<string, unknown>>,
          filename: 'Inventory_Stock_Report',
        }
      }
      case 'wastage': {
        const baseCols: ReportTableColumn[] = [
          { header: 'Job Number', key: 'job_number' },
          { header: 'Machine', key: 'machine_name' },
          { header: 'Date', key: 'wastage_date' },
          { header: 'Reason', key: 'reason' },
          { header: 'Sheets Wasted', key: 'sheets_wasted', align: 'right' },
        ]
        if (canShowPayments) {
          baseCols.push({ header: 'Estimated Scrap Cost (₹)', key: 'estimated_cost', align: 'right' })
        }
        return {
          title: 'Production Wastage & Scrap Analysis',
          subtitle: 'Paper damage, printing defects, finishing errors, and cost of lost stock.',
          columns: baseCols,
          rows: (data?.wastage_records || []) as Array<Record<string, unknown>>,
          filename: 'Wastage_Analysis_Report',
        }
      }
      case 'counters': {
        const cols: ReportTableColumn[] = [
          { header: 'Machine', key: 'machine_name' },
          { header: 'Operator', key: 'operator_name' },
          { header: 'Count Date', key: 'count_date' },
          { header: 'Closing Counter', key: 'closing_counter', align: 'right' },
          { header: 'Clicks Produced', key: 'click_count', align: 'right' },
          { header: 'Wastage Sheets', key: 'wastage_sheets', align: 'right' },
        ]
        return {
          title: 'Machine Meter Readings & Yield',
          subtitle: 'Daily impressions, operator shifts, click yield, and mechanical counter logs.',
          columns: cols,
          rows: (data?.machine_counters || []) as Array<Record<string, unknown>>,
          filename: 'Machine_Counter_Yield_Report',
        }
      }
      default:
        return null
    }
  }, [activeTab, canShowPayments, data])

  // Filtered rows for active tab
  const filteredRows = useMemo(() => {
    if (!tabConfig) return []
    if (!tableSearch.trim()) return tabConfig.rows
    const q = tableSearch.toLowerCase()
    return tabConfig.rows.filter((row) =>
      Object.values(row).some((val) => String(val ?? '').toLowerCase().includes(q)),
    )
  }, [tabConfig, tableSearch])

  const paginatedRows = useMemo(() => {
    return filteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
  }, [filteredRows, page, rowsPerPage])

  // Trigger Excel Export for active tab
  const handleExportActiveExcel = () => {
    if (!tabConfig) return
    exportReportToExcel({
      title: tabConfig.title,
      subtitle: tabConfig.subtitle,
      periodText,
      columns: tabConfig.columns,
      rows: filteredRows,
      filenamePrefix: tabConfig.filename,
    })
  }

  // Trigger PDF Export for active tab
  const handleExportActivePdf = () => {
    if (!tabConfig) return
    exportReportToPdf({
      title: tabConfig.title,
      subtitle: tabConfig.subtitle,
      periodText,
      columns: tabConfig.columns,
      rows: filteredRows,
      filenamePrefix: tabConfig.filename,
      orientation: 'landscape',
    })
  }

  // Trigger Comprehensive Full Workbook Export (All 8 sheets)
  const handleExportFullWorkbook = () => {
    if (!data) return
    const sheets: Array<{ sheetName: string; columns: ReportTableColumn[]; rows: Array<Record<string, unknown>> }> = []

    // 1. In Jobs
    sheets.push({
      sheetName: 'In-House Jobs',
      columns: [
        { header: 'Job No', key: 'job_number' },
        { header: 'Customer', key: 'customer_name' },
        { header: 'Job Type', key: 'job_type' },
        { header: 'Job Date', key: 'job_date' },
        { header: 'Priority', key: 'priority' },
        { header: 'Printing', key: 'printing_status' },
        { header: 'Finishing', key: 'finishing_status' },
        { header: 'Sheets', key: 'sheet_count' },
        { header: 'Clicks', key: 'click_count' },
        ...(canShowPayments
          ? [
              { header: 'Total (₹)', key: 'total_amount' },
              { header: 'Advance (₹)', key: 'advance' },
              { header: 'Balance (₹)', key: 'balance' },
              { header: 'Payment Status', key: 'payment_status' },
            ]
          : []),
      ] as ReportTableColumn[],
      rows: data.in_jobs || [],
    })

    // 2. Out Jobs
    sheets.push({
      sheetName: 'Out-Jobs',
      columns: [
        { header: 'Job No', key: 'job_number' },
        { header: 'Customer', key: 'customer_name' },
        { header: 'Vendor', key: 'vendor_name' },
        { header: 'Priority', key: 'priority' },
        { header: 'Status', key: 'status' },
        { header: 'Quantity', key: 'quantity' },
        { header: 'Delivery Date', key: 'delivery_date' },
        ...(canShowPayments
          ? [
              { header: 'Customer Price', key: 'total_amount' },
              { header: 'Vendor Cost', key: 'vendor_cost' },
              { header: 'Profit (₹)', key: 'profit' },
            ]
          : []),
      ] as ReportTableColumn[],
      rows: data.out_jobs || [],
    })

    // 3. Collections (if allowed)
    if (canShowPayments && data.customer_payments) {
      sheets.push({
        sheetName: 'Collections',
        columns: [
          { header: 'Receipt No', key: 'payment_number' },
          { header: 'Customer', key: 'customer_name' },
          { header: 'Job Number', key: 'job_number' },
          { header: 'Date', key: 'payment_date' },
          { header: 'Method', key: 'payment_method' },
          { header: 'Amount (₹)', key: 'amount' },
          { header: 'Reference', key: 'reference' },
        ] as ReportTableColumn[],
        rows: data.customer_payments,
      })
    }

    // 4. Vendor Disbursements (if allowed)
    if (canShowPayments && data.vendor_payments) {
      sheets.push({
        sheetName: 'Vendor Disbursements',
        columns: [
          { header: 'Voucher No', key: 'payment_number' },
          { header: 'Supplier', key: 'supplier_name' },
          { header: 'Out Job Ref', key: 'out_job_number' },
          { header: 'Date', key: 'payment_date' },
          { header: 'Method', key: 'payment_method' },
          { header: 'Amount (₹)', key: 'amount' },
          { header: 'Reference', key: 'reference' },
        ] as ReportTableColumn[],
        rows: data.vendor_payments,
      })
    }

    // 5. Customers
    sheets.push({
      sheetName: 'Customers Ledger',
      columns: [
        { header: 'Customer Name', key: 'name' },
        { header: 'Phone', key: 'phone' },
        { header: 'Total Orders', key: 'total_jobs' },
        ...(canShowPayments
          ? [
              { header: 'Total Billed (₹)', key: 'total_billed' },
              { header: 'Total Paid (₹)', key: 'total_paid' },
              { header: 'Outstanding Balance (₹)', key: 'outstanding_balance' },
            ]
          : []),
      ] as ReportTableColumn[],
      rows: data.customers || [],
    })

    // 6. Deliveries
    sheets.push({
      sheetName: 'Deliveries',
      columns: [
        { header: 'Job Number', key: 'job_number' },
        { header: 'Customer', key: 'customer_name' },
        { header: 'Address', key: 'delivery_address' },
        { header: 'Method', key: 'delivery_method' },
        { header: 'Status', key: 'status' },
        { header: 'Date', key: 'delivery_date' },
      ] as ReportTableColumn[],
      rows: data.deliveries || [],
    })

    // 7. Stock
    sheets.push({
      sheetName: 'Inventory & Stock',
      columns: [
        { header: 'Item Name', key: 'name' },
        { header: 'Category', key: 'category' },
        { header: 'Current Stock', key: 'current_stock' },
        { header: 'Min Stock', key: 'min_stock' },
        { header: 'Unit', key: 'unit' },
      ] as ReportTableColumn[],
      rows: data.stock_items || [],
    })

    // 8. Wastage
    sheets.push({
      sheetName: 'Wastage',
      columns: [
        { header: 'Job Number', key: 'job_number' },
        { header: 'Machine', key: 'machine_name' },
        { header: 'Date', key: 'wastage_date' },
        { header: 'Reason', key: 'reason' },
        { header: 'Sheets Wasted', key: 'sheets_wasted' },
        ...(canShowPayments ? [{ header: 'Estimated Cost (₹)', key: 'estimated_cost' }] : []),
      ] as ReportTableColumn[],
      rows: data.wastage_records || [],
    })

    exportComprehensiveWorkbookToExcel({
      title: 'Libin Prints Complete ERP Analytics',
      periodText,
      sheets,
      filenamePrefix: 'Complete_ERP_Report',
    })
  }

  // Native Print
  const handlePrint = () => {
    window.print()
  }

  return (
    <Box sx={{ pb: 6 }}>
      {/* Page Header */}
      <PageHeader
        title="Executive Management Reports"
        description="Comprehensive operational insights, financial reconciliation, and real-time production analytics."
      />

      {/* Date Filter & Export Ribbon */}
      <Card sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          {/* Date range picker controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CalendarMonthRounded sx={{ color: '#6366f1' }} fontSize="small" />
              <Typography variant="body2" fontWeight={700} color="text.secondary">
                REPORT PERIOD:
              </Typography>
            </Box>

            <TextField
              select
              size="small"
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="today">Today</MenuItem>
              <MenuItem value="this_week">This Week</MenuItem>
              <MenuItem value="this_month">This Month</MenuItem>
              <MenuItem value="last_month">Last Month</MenuItem>
              <MenuItem value="this_quarter">This Quarter</MenuItem>
              <MenuItem value="all">All Time</MenuItem>
              <MenuItem value="custom">Custom Date Range</MenuItem>
            </TextField>

            {datePreset === 'custom' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                  type="date"
                  size="small"
                  label="From"
                  InputLabelProps={{ shrink: true }}
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
                <TextField
                  type="date"
                  size="small"
                  label="To"
                  InputLabelProps={{ shrink: true }}
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </Box>
            )}

            <Tooltip title="Refresh Data">
              <IconButton size="small" onClick={() => reportQuery.refetch()} disabled={reportQuery.isFetching}>
                <RefreshRounded fontSize="small" />
              </IconButton>
            </Tooltip>

            <Chip
              size="small"
              variant="outlined"
              color="primary"
              label={`Filtered: ${periodText}`}
              sx={{ fontWeight: 600, fontSize: 12 }}
            />
          </Box>

          {/* Quick Action Export Buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
            {activeTab !== 'overview' && (
              <>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<TableChartRounded />}
                  onClick={handleExportActiveExcel}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    borderColor: '#10b981',
                    color: '#059669',
                    '&:hover': { bgcolor: '#ecfdf5', borderColor: '#059669' },
                  }}
                >
                  Download Excel (.xlsx)
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PictureAsPdfRounded />}
                  onClick={handleExportActivePdf}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    borderColor: '#ef4444',
                    color: '#dc2626',
                    '&:hover': { bgcolor: '#fef2f2', borderColor: '#dc2626' },
                  }}
                >
                  Download PDF
                </Button>
              </>
            )}

            <Button
              variant="contained"
              size="small"
              startIcon={<FileDownloadRounded />}
              onClick={handleExportFullWorkbook}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                bgcolor: '#4f46e5',
                '&:hover': { bgcolor: '#4338ca' },
              }}
            >
              Export Complete ERP Workbook
            </Button>

            <Tooltip title="Print Document">
              <IconButton size="small" onClick={handlePrint} sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5 }}>
                <PrintRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Card>

      {/* Top Stat Cards Ribbon */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0, 1fr))',
            md: canShowPayments ? 'repeat(3, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
            lg: canShowPayments ? 'repeat(6, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
          },
          gap: 1.5,
          mb: 3,
        }}
      >
        {canShowPayments ? (
          <>
            <Card sx={{ p: 2, borderRadius: 2, borderLeft: '4px solid #6366f1' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">TOTAL REVENUE</Typography>
                <TrendingUpRounded sx={{ color: '#6366f1', fontSize: 18 }} />
              </Box>
              <Typography variant="h6" fontWeight={800} color="#1e293b">{fmtMoney(kpis.total_revenue)}</Typography>
              <Typography variant="caption" color="text.secondary">{kpis.total_jobs ?? 0} total jobs billed</Typography>
            </Card>

            <Card sx={{ p: 2, borderRadius: 2, borderLeft: '4px solid #10b981' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">COLLECTED</Typography>
                <PaymentsRounded sx={{ color: '#10b981', fontSize: 18 }} />
              </Box>
              <Typography variant="h6" fontWeight={800} color="#059669">{fmtMoney(kpis.total_customer_collected)}</Typography>
              <Typography variant="caption" color="text.secondary">Receipts processed</Typography>
            </Card>

            <Card sx={{ p: 2, borderRadius: 2, borderLeft: '4px solid #ef4444' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">PENDING RECEIVABLES</Typography>
                <HourglassTopRounded sx={{ color: '#ef4444', fontSize: 18 }} />
              </Box>
              <Typography variant="h6" fontWeight={800} color="#dc2626">{fmtMoney(kpis.total_customer_pending)}</Typography>
              <Typography variant="caption" color="text.secondary">Unpaid customer balances</Typography>
            </Card>

            <Card sx={{ p: 2, borderRadius: 2, borderLeft: '4px solid #f59e0b' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">VENDOR OUTFLOW</Typography>
                <LocalShippingRounded sx={{ color: '#f59e0b', fontSize: 18 }} />
              </Box>
              <Typography variant="h6" fontWeight={800} color="#d97706">{fmtMoney(kpis.total_vendor_cost)}</Typography>
              <Typography variant="caption" color="text.secondary">Paid: {fmtMoney(kpis.total_vendor_paid)}</Typography>
            </Card>

            <Card sx={{ p: 2, borderRadius: 2, borderLeft: '4px solid #06b6d4' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">GROSS PROFIT</Typography>
                <AccountBalanceWalletRounded sx={{ color: '#06b6d4', fontSize: 18 }} />
              </Box>
              <Typography variant="h6" fontWeight={800} color="#0891b2">{fmtMoney(kpis.gross_profit)}</Typography>
              <Typography variant="caption" color="text.secondary">Net operational margin</Typography>
            </Card>

            <Card sx={{ p: 2, borderRadius: 2, borderLeft: '4px solid #8b5cf6' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">PRODUCTION YIELD</Typography>
                <PrecisionManufacturingRounded sx={{ color: '#8b5cf6', fontSize: 18 }} />
              </Box>
              <Typography variant="h6" fontWeight={800} color="#7c3aed">{(kpis.total_clicks || 0).toLocaleString()} Clicks</Typography>
              <Typography variant="caption" color="text.secondary">{(kpis.total_sheets || 0).toLocaleString()} sheets printed</Typography>
            </Card>
          </>
        ) : (
          <>
            <Card sx={{ p: 2, borderRadius: 2, borderLeft: '4px solid #6366f1' }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">TOTAL JOBS</Typography>
              <Typography variant="h5" fontWeight={800} color="#1e293b">{kpis.total_jobs ?? 0}</Typography>
              <Typography variant="caption" color="text.secondary">Production pipeline</Typography>
            </Card>

            <Card sx={{ p: 2, borderRadius: 2, borderLeft: '4px solid #10b981' }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">IN-HOUSE JOBS</Typography>
              <Typography variant="h5" fontWeight={800} color="#059669">{kpis.in_jobs_count ?? 0}</Typography>
              <Typography variant="caption" color="text.secondary">Printing & finishing</Typography>
            </Card>

            <Card sx={{ p: 2, borderRadius: 2, borderLeft: '4px solid #f59e0b' }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">OUT-JOBS</Typography>
              <Typography variant="h5" fontWeight={800} color="#d97706">{kpis.out_jobs_count ?? 0}</Typography>
              <Typography variant="caption" color="text.secondary">Outsourced jobs</Typography>
            </Card>

            <Card sx={{ p: 2, borderRadius: 2, borderLeft: '4px solid #8b5cf6' }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">TOTAL IMPRESSIONS</Typography>
              <Typography variant="h5" fontWeight={800} color="#7c3aed">{(kpis.total_clicks || 0).toLocaleString()}</Typography>
              <Typography variant="caption" color="text.secondary">{(kpis.total_sheets || 0).toLocaleString()} paper sheets</Typography>
            </Card>
          </>
        )}
      </Box>

      {/* Navigation Tabs */}
      <Card sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => {
            setActiveTab(val)
            setPage(0)
            setTableSearch('')
          }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: 2,
            borderBottom: '1px solid #f1f5f9',
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, fontSize: 13, minHeight: 48 },
          }}
        >
          <Tab value="overview" icon={<AssessmentRounded />} iconPosition="start" label="Executive Overview" />
          <Tab value="in_jobs" icon={<FactoryRounded />} iconPosition="start" label={`In-Jobs (${data?.in_jobs?.length ?? 0})`} />
          <Tab value="out_jobs" icon={<LocalShippingRounded />} iconPosition="start" label={`Out-Jobs (${data?.out_jobs?.length ?? 0})`} />
          {canShowPayments && <Tab value="collections" icon={<PaymentsRounded />} iconPosition="start" label={`Collections (${data?.customer_payments?.length ?? 0})`} />}
          {canShowPayments && <Tab value="vendor_payments" icon={<AccountBalanceWalletRounded />} iconPosition="start" label={`Vendor Outflows (${data?.vendor_payments?.length ?? 0})`} />}
          <Tab value="customers" icon={<PeopleAltRounded />} iconPosition="start" label={`Customers (${data?.customers?.length ?? 0})`} />
          <Tab value="deliveries" icon={<LocalShippingRounded />} iconPosition="start" label={`Deliveries (${data?.deliveries?.length ?? 0})`} />
          <Tab value="stock" icon={<Inventory2Rounded />} iconPosition="start" label={`Inventory (${data?.stock_items?.length ?? 0})`} />
          <Tab value="wastage" icon={<DeleteSweepRounded />} iconPosition="start" label={`Wastage (${data?.wastage_records?.length ?? 0})`} />
          <Tab value="counters" icon={<PrecisionManufacturingRounded />} iconPosition="start" label={`Machine Counters (${data?.machine_counters?.length ?? 0})`} />
        </Tabs>
      </Card>

      {/* Main Content Area */}
      {reportQuery.isLoading ? (
        <Card sx={{ p: 8, display: 'grid', placeItems: 'center', borderRadius: 2 }}>
          <Box sx={{ textAlign: 'center' }}>
            <CircularProgress size={36} sx={{ color: '#4f46e5', mb: 2 }} />
            <Typography variant="body1" fontWeight={700}>Compiling Executive Analytics...</Typography>
            <Typography variant="caption" color="text.secondary">Aggregating production logs and financial ledgers</Typography>
          </Box>
        </Card>
      ) : reportQuery.isError ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          {apiError(reportQuery.error)}
        </Alert>
      ) : activeTab === 'overview' ? (
        /* Executive Overview Tab */
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.4fr 1fr' }, gap: 3 }}>
          {/* Left: Financial Performance & God's Share / Petty Cash Breakdown */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {canShowPayments && (
              <Card sx={{ p: 2.5, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight={800}>
                    Treasury & Cash Accounts Balance
                  </Typography>
                  <AccountBalanceRounded sx={{ color: '#4f46e5' }} />
                </Box>
                <Divider sx={{ mb: 2 }} />
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
                  {(data?.cash_accounts || []).map((acc: { id: number; name: string; account_type: string; balance: number }) => (
                    <Paper
                      key={acc.id}
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: acc.name.toLowerCase().includes('god') ? '#fdf4ff' : '#f8fafc',
                        borderColor: acc.name.toLowerCase().includes('god') ? '#f0abfc' : '#e2e8f0',
                      }}
                    >
                      <Typography variant="caption" fontWeight={700} color="text.secondary" textTransform="uppercase">
                        {acc.name}
                      </Typography>
                      <Typography variant="h6" fontWeight={800} sx={{ mt: 0.5, color: '#1e293b' }}>
                        {fmtMoney(acc.balance)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Type: {humanize(acc.account_type)}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              </Card>
            )}

            {/* Production & Machine Highlights */}
            <Card sx={{ p: 2.5, borderRadius: 2 }}>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 2 }}>
                Production Highlights & Metrics
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>TOTAL IMPRESSIONS</Typography>
                  <Typography variant="h5" fontWeight={800} color="#4f46e5" sx={{ mt: 0.5 }}>
                    {(kpis.total_clicks || 0).toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Machine meter clicks</Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>PAPER CONSUMPTION</Typography>
                  <Typography variant="h5" fontWeight={800} color="#0ea5e9" sx={{ mt: 0.5 }}>
                    {(kpis.total_sheets || 0).toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Sheets fed into presses</Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>TOTAL SCRAP / WASTAGE</Typography>
                  <Typography variant="h5" fontWeight={800} color="#ef4444" sx={{ mt: 0.5 }}>
                    {(kpis.total_wastage_sheets || 0).toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {canShowPayments ? `Cost: ${fmtMoney(kpis.total_wastage_cost)}` : 'Wasted sheets'}
                  </Typography>
                </Paper>
              </Box>
            </Card>
          </Box>

          {/* Right: Operational Health Summary */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Card sx={{ p: 2.5, borderRadius: 2 }}>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 2 }}>
                Operational Workload Split
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: '#f8fafc', borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <FactoryRounded sx={{ color: '#4f46e5' }} />
                    <Box>
                      <Typography variant="body2" fontWeight={700}>In-House Print Jobs</Typography>
                      <Typography variant="caption" color="text.secondary">Internal press production</Typography>
                    </Box>
                  </Box>
                  <Typography variant="h6" fontWeight={800}>{kpis.in_jobs_count ?? 0}</Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: '#f8fafc', borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <LocalShippingRounded sx={{ color: '#f59e0b' }} />
                    <Box>
                      <Typography variant="body2" fontWeight={700}>Out-Jobs / Outsourced</Typography>
                      <Typography variant="caption" color="text.secondary">Commercial partners</Typography>
                    </Box>
                  </Box>
                  <Typography variant="h6" fontWeight={800}>{kpis.out_jobs_count ?? 0}</Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: '#f8fafc', borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Inventory2Rounded sx={{ color: kpis.low_stock_items > 0 ? '#ef4444' : '#10b981' }} />
                    <Box>
                      <Typography variant="body2" fontWeight={700}>Low Stock Inventory Alerts</Typography>
                      <Typography variant="caption" color="text.secondary">Items below reorder limit</Typography>
                    </Box>
                  </Box>
                  <Chip
                    label={kpis.low_stock_items > 0 ? `${kpis.low_stock_items} Critical` : 'Stock Optimal'}
                    color={kpis.low_stock_items > 0 ? 'error' : 'success'}
                    size="small"
                    sx={{ fontWeight: 700 }}
                  />
                </Box>
              </Box>
            </Card>

            {/* Quick Export Panel */}
            <Card sx={{ p: 2.5, borderRadius: 2, bgcolor: '#f8fafc', border: '1px dashed #cbd5e1' }}>
              <Typography variant="subtitle2" fontWeight={800} color="#1e293b" sx={{ mb: 1 }}>
                Analyst Export Center
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Instantly extract comprehensive datasets for audits, board meetings, tax filing, and reconciliation.
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<TableChartRounded />}
                  onClick={handleExportFullWorkbook}
                  sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#10b981', color: '#059669', bgcolor: '#fff' }}
                >
                  Download All 8 Worksheets (.xlsx)
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<PictureAsPdfRounded />}
                  onClick={() => {
                    setActiveTab('in_jobs')
                  }}
                  sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#ef4444', color: '#dc2626', bgcolor: '#fff' }}
                >
                  Download Category Reports (PDF)
                </Button>
              </Box>
            </Card>
          </Box>
        </Box>
      ) : tabConfig ? (
        /* Detailed Tab Data Table */
        <Card sx={{ borderRadius: 2 }}>
          {/* Table Toolbar */}
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9' }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={800}>{tabConfig.title}</Typography>
              <Typography variant="caption" color="text.secondary">{tabConfig.subtitle}</Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <TextField
                size="small"
                placeholder="Search in this report..."
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value)
                  setPage(0)
                }}
                sx={{ width: { xs: 200, sm: 260 } }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRounded fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {filteredRows.length} records
              </Typography>
            </Box>
          </Box>

          {/* Table Container */}
          {filteredRows.length === 0 ? (
            <Box sx={{ p: 6, textAlign: 'center' }}>
              <Typography variant="body1" fontWeight={700} color="text.secondary">No matching records found.</Typography>
              <Typography variant="caption" color="text.secondary">Try adjusting your date range or search query.</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase', bgcolor: '#f8fafc', py: 1.5 } }}>
                    {tabConfig.columns.map((col) => (
                      <TableCell key={col.key} align={col.align ?? 'left'}>
                        {col.header}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedRows.map((row, idx) => (
                    <TableRow key={idx} hover sx={{ '& td': { py: 1.25, fontSize: 13 } }}>
                      {tabConfig.columns.map((col) => {
                        const val = row[col.key]

                        // Custom chip renders for statuses
                        if (['printing_status', 'finishing_status', 'status', 'payment_status', 'vendor_payment_status'].includes(col.key)) {
                          const s = String(val || 'pending').toLowerCase()
                          const isSuccess = ['completed', 'paid', 'delivered'].includes(s)
                          const isWarning = ['in_progress', 'partial', 'sent'].includes(s)
                          return (
                            <TableCell key={col.key} align={col.align ?? 'left'}>
                              <Chip
                                size="small"
                                label={humanize(val)}
                                color={isSuccess ? 'success' : isWarning ? 'warning' : 'default'}
                                sx={{ height: 22, fontSize: 11, fontWeight: 700 }}
                              />
                            </TableCell>
                          )
                        }

                        // Low stock boolean
                        if (col.key === 'is_low_stock') {
                          return (
                            <TableCell key={col.key} align={col.align ?? 'left'}>
                              <Chip
                                size="small"
                                label={val ? 'Low Stock' : 'In Stock'}
                                color={val ? 'error' : 'success'}
                                sx={{ height: 22, fontSize: 11, fontWeight: 700 }}
                              />
                            </TableCell>
                          )
                        }

                        // Currency values
                        if (typeof val === 'number' && (col.key.includes('amount') || col.key.includes('cost') || col.key.includes('balance') || col.key.includes('billed') || col.key.includes('paid') || col.key.includes('profit') || col.key.includes('revenue'))) {
                          return (
                            <TableCell key={col.key} align={col.align ?? 'left'} sx={{ fontWeight: 700, color: '#1e293b' }}>
                              {fmtMoney(val)}
                            </TableCell>
                          )
                        }

                        // Default cell
                        return (
                          <TableCell key={col.key} align={col.align ?? 'left'} sx={{ color: col.key.includes('job_number') ? '#4f46e5' : '#334155', fontWeight: col.key.includes('job_number') ? 700 : 400 }}>
                            {String(val ?? '—')}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Pagination */}
          <TablePagination
            component="div"
            count={filteredRows.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[]}
          />
        </Card>
      ) : null}
    </Box>
  )
}
