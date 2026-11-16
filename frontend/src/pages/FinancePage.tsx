import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, InputLabel, ListItemIcon, ListItemText,
  Menu, MenuItem, Select, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow,
  Tabs, TextField, Typography,
} from '@mui/material'
import AccountBalanceWalletRounded from '@mui/icons-material/AccountBalanceWalletRounded'
import AddRounded from '@mui/icons-material/AddRounded'
import CallMadeRounded from '@mui/icons-material/CallMadeRounded'
import CallReceivedRounded from '@mui/icons-material/CallReceivedRounded'
import CompareArrowsRounded from '@mui/icons-material/CompareArrowsRounded'
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded'
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'

import { api, apiError } from '../api/client'
import { PageHeader } from '../components/PageHeader'
import { PaymentCreateForm } from '../components/PaymentCreateForm'

interface LedgerEntry {
  id: string
  raw_id: number
  date: string
  timestamp: string
  type: string
  type_key: string
  reason: string
  credit: number
  debit: number
  account_name: string
  account_id?: number
  method: string
  reference_no: string
  recorded_by: string
  job_number?: string
  customer_name?: string
  supplier_name?: string
}

interface LedgerResponse {
  entries: LedgerEntry[]
  summary: {
    total_credit: number
    total_debit: number
    net_flow: number
    available_cash: number
    petty_cash?: number
    bank_cash?: number
    god_cash?: number
    total_receivables: number
    total_payables: number
    total_net_profit: number
    accounts: Array<{ id: number; name: string; account_type: string; balance: number }>
    count: number
  }
}

function formatINR(val: number | string) {
  return `₹${Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function typeChipColor(typeKey: string): 'success' | 'warning' | 'error' | 'info' | 'secondary' | 'default' {
  switch (typeKey) {
    case 'customer_payment':
      return 'success'
    case 'vendor_payment':
      return 'warning'
    case 'expense':
      return 'error'
    case 'credit':
      return 'info'
    case 'debit':
      return 'secondary'
    case 'transfer':
      return 'default'
    default:
      return 'default'
  }
}

export function FinancePage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'all' | 'customer_payment' | 'vendor_payment' | 'manual' | 'transfer'>('all')
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState('')

  // Dialog & Menu states
  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null)
  const [customerModal, setCustomerModal] = useState(false)
  const [vendorModal, setVendorModal] = useState(false)
  const [expenseModal, setExpenseModal] = useState(false)
  const [transferModal, setTransferModal] = useState(false)
  const [actionError, setActionError] = useState('')

  // Expense form state
  const [expenseType, setExpenseType] = useState<'expense' | 'credit' | 'debit'>('expense')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [expenseAccount, setExpenseAccount] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('')
  const [expenseDescription, setExpenseDescription] = useState('')
  const [expenseRef, setExpenseRef] = useState('')

  // Transfer form state
  const [transferSource, setTransferSource] = useState('')
  const [transferDest, setTransferDest] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [transferReason, setTransferReason] = useState('')

  const ledgerQuery = useQuery({
    queryKey: ['finance-unified-ledger', tab, search, accountFilter],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (tab !== 'all') params.type = tab
      if (search.trim()) params.search = search.trim()
      if (accountFilter) params.account = accountFilter
      return (await api.get<LedgerResponse>('/finance-entries/unified-ledger/', { params })).data
    },
    refetchInterval: 20_000,
  })

  // Customer payment mutation
  const customerPaymentMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      await api.post('/customer-payments/', payload)
    },
    onSuccess: async () => {
      setCustomerModal(false)
      setActionError('')
      await queryClient.invalidateQueries({ queryKey: ['finance-unified-ledger'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err) => setActionError(apiError(err)),
  })

  // Vendor payment mutation
  const vendorPaymentMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      await api.post('/vendor-payments/', payload)
    },
    onSuccess: async () => {
      setVendorModal(false)
      setActionError('')
      await queryClient.invalidateQueries({ queryKey: ['finance-unified-ledger'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err) => setActionError(apiError(err)),
  })

  // Manual finance entry mutation
  const financeEntryMutation = useMutation({
    mutationFn: async () => {
      if (!expenseAmount || Number(expenseAmount) <= 0) throw new Error('Enter a valid amount.')
      if (!expenseAccount) throw new Error('Select a cash/bank account.')
      if (!expenseDescription.trim()) throw new Error('Enter a description.')
      const uuid = crypto.randomUUID()
      await api.post('/finance-entries/', {
        entry_type: expenseType,
        amount: expenseAmount,
        entry_date: expenseDate,
        account: Number(expenseAccount),
        category: expenseCategory || null,
        description: expenseDescription.trim(),
        reference_no: expenseRef || null,
        request_key: uuid,
      })
    },
    onSuccess: async () => {
      setExpenseModal(false)
      setActionError('')
      setExpenseAmount('')
      setExpenseDescription('')
      setExpenseCategory('')
      setExpenseRef('')
      await queryClient.invalidateQueries({ queryKey: ['finance-unified-ledger'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err) => setActionError(apiError(err)),
  })

  // Cash transfer mutation
  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!transferSource || !transferDest) throw new Error('Select source and destination accounts.')
      if (transferSource === transferDest) throw new Error('Source and destination accounts must be different.')
      if (!transferAmount || Number(transferAmount) <= 0) throw new Error('Enter a valid transfer amount.')
      if (!transferReason.trim()) throw new Error('Enter a transfer reason.')
      await api.post('/cash-transfers/', {
        source: Number(transferSource),
        destination: Number(transferDest),
        amount: transferAmount,
        transfer_date: transferDate,
        reason: transferReason.trim(),
      })
    },
    onSuccess: async () => {
      setTransferModal(false)
      setActionError('')
      setTransferAmount('')
      setTransferReason('')
      await queryClient.invalidateQueries({ queryKey: ['finance-unified-ledger'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err) => setActionError(apiError(err)),
  })

  const data = ledgerQuery.data
  const accounts = data?.summary.accounts || []
  const pettyAccount = accounts.find((a) => a.account_type === 'petty' || a.name.toLowerCase().includes('petty'))
  const bankAccount = accounts.find((a) => a.account_type === 'net_bank' || a.name.toLowerCase().includes('bank'))
  const godAccount = accounts.find((a) => a.account_type === 'first_payment' || a.name.toLowerCase().includes('god'))

  const openPettyExpense = () => {
    setActionError('')
    setExpenseType('expense')
    setExpenseAccount(String(pettyAccount?.id || ''))
    setExpenseCategory('Shop & Daily Petty Expenses')
    setExpenseModal(true)
  }

  const openPettyTransfer = () => {
    setActionError('')
    setTransferSource(String(bankAccount?.id || ''))
    setTransferDest(String(pettyAccount?.id || ''))
    setTransferReason('Cash withdrawal / Petty cash top-up')
    setTransferModal(true)
  }

  return (
    <Box>
      <PageHeader
        eyebrow="Financial Management & Ledger"
        title="Finance & Accounts"
        description="Unified ledger tracking customer receipts, supplier settlements, expenses, and cash movements."
        actions={
          <Stack direction="row" spacing={1} flexWrap="wrap" gap={1} alignItems="center">
            <Button
              variant="contained"
              size="medium"
              startIcon={<AddRounded />}
              endIcon={<KeyboardArrowDownRounded />}
              onClick={(e) => setAddMenuAnchor(e.currentTarget)}
              sx={{
                bgcolor: 'primary.main',
                color: 'white',
                fontWeight: 800,
                fontSize: 14,
                px: 2.2,
                py: 0.9,
                borderRadius: 2,
                boxShadow: '0 4px 12px rgba(239, 108, 62, 0.28)',
                '&:hover': { bgcolor: 'primary.dark' },
                textTransform: 'none',
              }}
            >
              + Add New Data
            </Button>
            <Button
              variant="outlined"
              color="success"
              startIcon={<CallReceivedRounded />}
              onClick={() => { setActionError(''); setCustomerModal(true) }}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Receipt
            </Button>
            <Button
              variant="outlined"
              color="warning"
              startIcon={<CallMadeRounded />}
              onClick={() => { setActionError(''); setVendorModal(true) }}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Payment
            </Button>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<ReceiptLongRounded />}
              onClick={() => { setActionError(''); setExpenseType('expense'); setExpenseModal(true) }}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Expense
            </Button>
            <Button
              variant="outlined"
              sx={{ color: '#2f8f63', borderColor: '#2f8f63', textTransform: 'none', fontWeight: 700, '&:hover': { bgcolor: 'rgba(47, 143, 99, 0.08)' } }}
              startIcon={<AccountBalanceWalletRounded />}
              onClick={openPettyExpense}
            >
              + Petty Cash Expense
            </Button>
            <Button
              variant="outlined"
              startIcon={<CompareArrowsRounded />}
              onClick={() => { setActionError(''); setTransferModal(true) }}
              sx={{ textTransform: 'none', fontWeight: 650 }}
            >
              Transfer
            </Button>
          </Stack>
        }
      />

      {/* Add New Data Dropdown Menu */}
      <Menu
        anchorEl={addMenuAnchor}
        open={Boolean(addMenuAnchor)}
        onClose={() => setAddMenuAnchor(null)}
        slotProps={{
          paper: {
            sx: {
              width: 320,
              mt: 1,
              borderRadius: 2.5,
              boxShadow: '0 10px 32px rgba(0,0,0,0.14)',
              p: 0.8,
            },
          },
        }}
      >
        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null)
            setActionError('')
            setCustomerModal(true)
          }}
          sx={{ py: 1.2, borderRadius: 1.8 }}
        >
          <ListItemIcon sx={{ color: 'success.main', minWidth: 38 }}>
            <CallReceivedRounded />
          </ListItemIcon>
          <ListItemText
            primary={<Typography fontWeight={750} fontSize={14}>Customer Receipt</Typography>}
            secondary={<Typography fontSize={12} color="text.secondary">Record customer advance or balance payment</Typography>}
          />
        </MenuItem>

        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null)
            setActionError('')
            setVendorModal(true)
          }}
          sx={{ py: 1.2, borderRadius: 1.8 }}
        >
          <ListItemIcon sx={{ color: 'warning.main', minWidth: 38 }}>
            <CallMadeRounded />
          </ListItemIcon>
          <ListItemText
            primary={<Typography fontWeight={750} fontSize={14}>Vendor Payment</Typography>}
            secondary={<Typography fontSize={12} color="text.secondary">Payout to supplier for outsourced jobs</Typography>}
          />
        </MenuItem>

        <Divider sx={{ my: 0.8 }} />

        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null)
            openPettyExpense()
          }}
          sx={{ py: 1.2, borderRadius: 1.8, bgcolor: 'rgba(16, 185, 129, 0.08)' }}
        >
          <ListItemIcon sx={{ color: '#059669', minWidth: 38 }}>
            <AccountBalanceWalletRounded />
          </ListItemIcon>
          <ListItemText
            primary={<Typography fontWeight={750} fontSize={14} color="#059669">💵 Log Petty Cash Expense</Typography>}
            secondary={<Typography fontSize={12} color="text.secondary">Shop tea, conveyance, cleaning from drawer</Typography>}
          />
        </MenuItem>

        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null)
            openPettyTransfer()
          }}
          sx={{ py: 1.2, borderRadius: 1.8 }}
        >
          <ListItemIcon sx={{ color: 'primary.main', minWidth: 38 }}>
            <CompareArrowsRounded />
          </ListItemIcon>
          <ListItemText
            primary={<Typography fontWeight={750} fontSize={14}>🏧 Bank to Petty Cash (ATM Top-up)</Typography>}
            secondary={<Typography fontSize={12} color="text.secondary">Withdraw from Bank/ATM and top up Petty Cash drawer</Typography>}
          />
        </MenuItem>

        <Divider sx={{ my: 0.8 }} />

        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null)
            setActionError('')
            setExpenseType('expense')
            setExpenseModal(true)
          }}
          sx={{ py: 1.2, borderRadius: 1.8 }}
        >
          <ListItemIcon sx={{ color: 'error.main', minWidth: 38 }}>
            <ReceiptLongRounded />
          </ListItemIcon>
          <ListItemText
            primary={<Typography fontWeight={750} fontSize={14}>General Expense / Operating Cost</Typography>}
            secondary={<Typography fontSize={12} color="text.secondary">Rent, electricity, machine repairs</Typography>}
          />
        </MenuItem>

        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null)
            setActionError('')
            setExpenseType('credit')
            setExpenseModal(true)
          }}
          sx={{ py: 1.2, borderRadius: 1.8 }}
        >
          <ListItemIcon sx={{ color: 'info.main', minWidth: 38 }}>
            <AddRounded />
          </ListItemIcon>
          <ListItemText
            primary={<Typography fontWeight={750} fontSize={14}>Manual Credit / Inflow</Typography>}
            secondary={<Typography fontSize={12} color="text.secondary">Direct bank deposit, capital, or other receipts</Typography>}
          />
        </MenuItem>

        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null)
            setActionError('')
            setExpenseType('debit')
            setExpenseModal(true)
          }}
          sx={{ py: 1.2, borderRadius: 1.8 }}
        >
          <ListItemIcon sx={{ color: 'secondary.main', minWidth: 38 }}>
            <AccountBalanceWalletRounded />
          </ListItemIcon>
          <ListItemText
            primary={<Typography fontWeight={750} fontSize={14}>Manual Debit / Outflow</Typography>}
            secondary={<Typography fontSize={12} color="text.secondary">Owner drawing or manual account reduction</Typography>}
          />
        </MenuItem>

        <Divider sx={{ my: 0.8 }} />

        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null)
            setActionError('')
            setTransferModal(true)
          }}
          sx={{ py: 1.2, borderRadius: 1.8 }}
        >
          <ListItemIcon sx={{ color: 'primary.main', minWidth: 38 }}>
            <CompareArrowsRounded />
          </ListItemIcon>
          <ListItemText
            primary={<Typography fontWeight={750} fontSize={14}>Inter-Account Transfer</Typography>}
            secondary={<Typography fontSize={12} color="text.secondary">Move money between accounts</Typography>}
          />
        </MenuItem>
      </Menu>

      {/* Available Cash Across Different Methods & Accounts */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="subtitle2" fontWeight={800} color="text.secondary" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 11.5 }}>
          Available Cash by Payment Method & Account
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2 }}>
          {/* Petty Cash */}
          <Card sx={{ borderLeft: '4px solid #10b981', bgcolor: 'rgba(16, 185, 129, 0.02)' }}>
            <CardContent sx={{ p: '18px !important' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography color="text.secondary" fontSize={11.5} fontWeight={750}>💵 PETTY CASH (DRAWER)</Typography>
                <Chip size="small" label="Daily Cash" sx={{ bgcolor: '#ecfdf5', color: '#065f46', fontWeight: 700, fontSize: 10, height: 20 }} />
              </Box>
              <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 800, color: '#059669' }}>
                {formatINR(data?.summary.petty_cash ?? pettyAccount?.balance ?? 0)}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
                <Typography fontSize={11} color="text.secondary">Shop drawer balance</Typography>
                <Button size="small" variant="text" sx={{ p: 0, minWidth: 0, fontSize: 11, fontWeight: 750, color: '#059669', textTransform: 'none' }} onClick={openPettyExpense}>
                  + Expense
                </Button>
              </Box>
            </CardContent>
          </Card>

          {/* Net Bank / UPI */}
          <Card sx={{ borderLeft: '4px solid #3b82f6', bgcolor: 'rgba(59, 130, 246, 0.02)' }}>
            <CardContent sx={{ p: '18px !important' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography color="text.secondary" fontSize={11.5} fontWeight={750}>💳 NET BANK & UPI</Typography>
                <Chip size="small" label="Online / Bank" sx={{ bgcolor: '#eff6ff', color: '#1e40af', fontWeight: 700, fontSize: 10, height: 20 }} />
              </Box>
              <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 800, color: '#2563eb' }}>
                {formatINR(data?.summary.bank_cash ?? bankAccount?.balance ?? 0)}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
                <Typography fontSize={11} color="text.secondary">Bank & UPI balance</Typography>
                <Button size="small" variant="text" sx={{ p: 0, minWidth: 0, fontSize: 11, fontWeight: 750, color: '#2563eb', textTransform: 'none' }} onClick={openPettyTransfer}>
                  🏧 Top-up Petty
                </Button>
              </Box>
            </CardContent>
          </Card>

          {/* First Payment to God */}
          <Card sx={{ borderLeft: '4px solid #f59e0b', bgcolor: 'rgba(245, 158, 11, 0.03)' }}>
            <CardContent sx={{ p: '18px !important' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography color="text.secondary" fontSize={11.5} fontWeight={750}>🙏 FIRST PAYMENT (GOD'S ACCOUNT)</Typography>
                <Chip size="small" label="Sacred Reserve" sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 750, fontSize: 10, height: 20 }} />
              </Box>
              <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 800, color: '#d97706' }}>
                {formatINR(data?.summary.god_cash ?? godAccount?.balance ?? 0)}
              </Typography>
              <Typography fontSize={11} color="text.secondary" sx={{ mt: 1 }}>
                Stored for God · Untouchable reserve
              </Typography>
            </CardContent>
          </Card>

          {/* Total Available Liquidity */}
          <Card sx={{ borderLeft: '4px solid #7c3aed', bgcolor: 'rgba(124, 58, 237, 0.02)' }}>
            <CardContent sx={{ p: '18px !important' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography color="text.secondary" fontSize={11.5} fontWeight={750}>💼 TOTAL LIQUIDITY</Typography>
                <Chip size="small" label="All Accounts" sx={{ bgcolor: '#f3e8ff', color: '#6b21a8', fontWeight: 700, fontSize: 10, height: 20 }} />
              </Box>
              <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 800, color: '#7c3aed' }}>
                {formatINR(data?.summary.available_cash || 0)}
              </Typography>
              <Typography fontSize={11} color="text.secondary" sx={{ mt: 1 }}>
                Net Flow: {formatINR(data?.summary.net_flow || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Operational Financial Summary Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 2.5 }}>
        {/* Actual Payments In */}
        <Card sx={{ borderLeft: '4px solid #2f8f63' }}>
          <CardContent sx={{ p: '18px !important' }}>
            <Typography color="text.secondary" fontSize={11.5} fontWeight={750}>ACTUAL PAYMENTS (MONEY IN)</Typography>
            <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 800, color: '#2f8f63' }}>
              {formatINR(data?.summary.total_credit || 0)}
            </Typography>
            <Typography fontSize={11.5} color="text.secondary" sx={{ mt: 0.5 }}>
              Collected customer receipts
            </Typography>
          </CardContent>
        </Card>

        {/* Actual Payments Out */}
        <Card sx={{ borderLeft: '4px solid #d9381e' }}>
          <CardContent sx={{ p: '18px !important' }}>
            <Typography color="text.secondary" fontSize={11.5} fontWeight={750}>PAYMENTS OUT (MONEY OUT)</Typography>
            <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 800, color: '#d9381e' }}>
              {formatINR(data?.summary.total_debit || 0)}
            </Typography>
            <Typography fontSize={11.5} color="text.secondary" sx={{ mt: 0.5 }}>
              Vendor payouts & expenses
            </Typography>
          </CardContent>
        </Card>

        {/* Pending from Customers */}
        <Card sx={{ borderLeft: '4px solid #e67e22' }}>
          <CardContent sx={{ p: '18px !important' }}>
            <Typography color="text.secondary" fontSize={11.5} fontWeight={750}>PENDING FROM CUSTOMERS</Typography>
            <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 800, color: '#e67e22' }}>
              {formatINR(data?.summary.total_receivables || 0)}
            </Typography>
            <Typography fontSize={11.5} color="text.secondary" sx={{ mt: 0.5 }}>
              Outstanding customer receivables
            </Typography>
          </CardContent>
        </Card>

        {/* Pending to Vendors */}
        <Card sx={{ borderLeft: '4px solid #c0392b' }}>
          <CardContent sx={{ p: '18px !important' }}>
            <Typography color="text.secondary" fontSize={11.5} fontWeight={750}>PENDING TO VENDORS</Typography>
            <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 800, color: '#c0392b' }}>
              {formatINR(data?.summary.total_payables || 0)}
            </Typography>
            <Typography fontSize={11.5} color="text.secondary" sx={{ mt: 0.5 }}>
              Outstanding supplier payables
            </Typography>
          </CardContent>
        </Card>

        {/* Total Net Profit */}
        <Card sx={{ borderLeft: `4px solid ${(data?.summary.total_net_profit || 0) >= 0 ? '#167d89' : '#d9381e'}` }}>
          <CardContent sx={{ p: '18px !important' }}>
            <Typography color="text.secondary" fontSize={11.5} fontWeight={750}>TOTAL NET PROFIT</Typography>
            <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 800, color: (data?.summary.total_net_profit || 0) >= 0 ? '#167d89' : '#d9381e' }}>
              {formatINR(data?.summary.total_net_profit || 0)}
            </Typography>
            <Typography fontSize={11.5} color="text.secondary" sx={{ mt: 0.5 }}>
              Job value minus costs & expenses
            </Typography>
          </CardContent>
        </Card>

        {/* Net Cash Flow */}
        <Card sx={{ borderLeft: `4px solid ${(data?.summary.net_flow || 0) >= 0 ? '#27ae60' : '#d9381e'}` }}>
          <CardContent sx={{ p: '18px !important' }}>
            <Typography color="text.secondary" fontSize={11.5} fontWeight={750}>NET CASH FLOW</Typography>
            <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 800, color: (data?.summary.net_flow || 0) >= 0 ? '#27ae60' : '#d9381e' }}>
              {formatINR(data?.summary.net_flow || 0)}
            </Typography>
            <Typography fontSize={11.5} color="text.secondary" sx={{ mt: 0.5 }}>
              Credits minus debits
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Controls & Filter Bar */}
      <Card sx={{ mb: 2 }}>
        <Box sx={{ p: 2, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { md: 'center' }, justifyContent: 'space-between', gap: 2 }}>
          <Tabs
            value={tab}
            onChange={(_e, v) => setTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 0, textTransform: 'none', fontWeight: 700, fontSize: 13 } }}
          >
            <Tab label={`All (${data?.summary.count || 0})`} value="all" />
            <Tab label="Customer Receipts" value="customer_payment" />
            <Tab label="Vendor Payments" value="vendor_payment" />
            <Tab label="Expenses & Manual" value="manual" />
            <Tab label="Transfers" value="transfer" />
          </Tabs>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField
              size="small"
              placeholder="Search job, party, reason, ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: <SearchRounded fontSize="small" sx={{ color: 'text.disabled', mr: 0.8 }} />,
                },
              }}
              sx={{ width: { xs: '100%', sm: 280 } }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Account</InputLabel>
              <Select
                value={accountFilter}
                label="Account"
                onChange={(e) => setAccountFilter(e.target.value)}
              >
                <MenuItem value="">All Accounts</MenuItem>
                {accounts.map((acc) => (
                  <MenuItem key={acc.id} value={String(acc.id)}>{acc.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </Box>
      </Card>

      {/* Unified Transactions Grid */}
      <Card>
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h6" fontWeight={800}>Transactions Grid</Typography>
            <Chip label={`${data?.entries.length || 0} entries`} size="small" />
          </Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddRounded />}
            endIcon={<KeyboardArrowDownRounded />}
            onClick={(e) => setAddMenuAnchor(e.currentTarget)}
            sx={{
              fontWeight: 800,
              textTransform: 'none',
              borderRadius: 2,
              px: 1.8,
            }}
          >
            + Add New Data
          </Button>
        </Box>
        <Divider />

        {ledgerQuery.isLoading ? (
          <Box sx={{ p: 6, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>
        ) : ledgerQuery.isError ? (
          <Alert severity="error" sx={{ m: 2 }}>{apiError(ledgerQuery.error)}</Alert>
        ) : data && data.entries.length > 0 ? (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 800 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Reason / Description</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: '#2f8f63' }}>Credit (₹)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: '#d9381e' }}>Debit (₹)</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Account</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Method / Ref</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Recorded By</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.entries.map((entry) => (
                  <TableRow key={entry.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 650 }}>
                      {entry.date}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={entry.type}
                        color={typeChipColor(entry.type_key)}
                        sx={{ fontWeight: 700, fontSize: 11 }}
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 360 }}>
                      <Typography fontSize={13} fontWeight={650}>{entry.reason}</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: entry.credit > 0 ? '#2f8f63' : 'text.disabled' }}>
                      {entry.credit > 0 ? formatINR(entry.credit) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: entry.debit > 0 ? '#d9381e' : 'text.disabled' }}>
                      {entry.debit > 0 ? formatINR(entry.debit) : '—'}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {entry.account_name.toLowerCase().includes('god') ? (
                        <Chip
                          size="small"
                          label="🙏 God's Account"
                          sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 750, border: '1px solid #fde68a' }}
                        />
                      ) : entry.account_name.toLowerCase().includes('petty') ? (
                        <Chip
                          size="small"
                          label="💵 Petty Cash"
                          sx={{ bgcolor: '#ecfdf5', color: '#065f46', fontWeight: 700, border: '1px solid #a7f3d0' }}
                        />
                      ) : entry.account_name.toLowerCase().includes('bank') || entry.account_name.toLowerCase().includes('upi') ? (
                        <Chip
                          size="small"
                          label="💳 Bank / UPI"
                          sx={{ bgcolor: '#eff6ff', color: '#1e40af', fontWeight: 700, border: '1px solid #bfdbfe' }}
                        />
                      ) : (
                        entry.account_name
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>
                      {[entry.method, entry.reference_no].filter(Boolean).join(' · ') || '—'}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>
                      {entry.recorded_by || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        ) : (
          <Box sx={{ p: 6, textAlign: 'center' }}>
            <ReceiptLongRounded sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="h6" color="text.secondary">No financial transactions found</Typography>
            <Typography fontSize={13} color="text.disabled" sx={{ mb: 2 }}>Try adjusting your search or tab filters, or record a new transaction.</Typography>
            <Button
              variant="contained"
              startIcon={<AddRounded />}
              endIcon={<KeyboardArrowDownRounded />}
              onClick={(e) => setAddMenuAnchor(e.currentTarget)}
              sx={{ fontWeight: 800, textTransform: 'none', borderRadius: 2 }}
            >
              + Add New Data
            </Button>
          </Box>
        )}
      </Card>

      {/* DIALOG 1: Record Customer Receipt */}
      <Dialog open={customerModal} onClose={() => setCustomerModal(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Record Customer Receipt</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <PaymentCreateForm
            kind="customer"
            pending={customerPaymentMutation.isPending}
            error={actionError}
            onClose={() => setCustomerModal(false)}
            onSave={(payload) => customerPaymentMutation.mutate(payload)}
          />
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: Record Vendor Payment */}
      <Dialog open={vendorModal} onClose={() => setVendorModal(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Record Vendor Payment</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <PaymentCreateForm
            kind="vendor"
            pending={vendorPaymentMutation.isPending}
            error={actionError}
            onClose={() => setVendorModal(false)}
            onSave={(payload) => vendorPaymentMutation.mutate(payload)}
          />
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: Record Manual Finance Entry */}
      <Dialog open={expenseModal} onClose={() => setExpenseModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Record Expense / Credit / Debit</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Entry Type</InputLabel>
              <Select
                value={expenseType}
                label="Entry Type"
                onChange={(e) => setExpenseType(e.target.value as 'expense' | 'credit' | 'debit')}
              >
                <MenuItem value="expense">Expense (Money Out)</MenuItem>
                <MenuItem value="debit">Debit (Money Out)</MenuItem>
                <MenuItem value="credit">Credit (Money In)</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Amount"
              type="number"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              required
            />
            <TextField
              size="small"
              label="Entry Date"
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              required
            />
            <FormControl fullWidth size="small" required>
              <InputLabel>Cash / Bank Account</InputLabel>
              <Select
                value={expenseAccount}
                label="Cash / Bank Account"
                onChange={(e) => setExpenseAccount(e.target.value)}
              >
                {accounts.map((acc) => (
                  <MenuItem key={acc.id} value={String(acc.id)}>{acc.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Category (e.g. Utilities, Rent, Salaries)"
              value={expenseCategory}
              onChange={(e) => setExpenseCategory(e.target.value)}
            />
            <TextField
              size="small"
              label="Description / Reason"
              value={expenseDescription}
              onChange={(e) => setExpenseDescription(e.target.value)}
              required
            />
            <TextField
              size="small"
              label="Reference Number (optional)"
              value={expenseRef}
              onChange={(e) => setExpenseRef(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setExpenseModal(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => financeEntryMutation.mutate()}
            disabled={financeEntryMutation.isPending}
          >
            {financeEntryMutation.isPending ? 'Saving…' : 'Save Entry'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DIALOG 4: Transfer Cash */}
      <Dialog open={transferModal} onClose={() => setTransferModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Cash Transfer Between Accounts</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth size="small" required>
              <InputLabel>Source Account (Transfer From)</InputLabel>
              <Select
                value={transferSource}
                label="Source Account (Transfer From)"
                onChange={(e) => setTransferSource(e.target.value)}
              >
                {accounts.map((acc) => (
                  <MenuItem key={acc.id} value={String(acc.id)}>{acc.name} ({formatINR(acc.balance)})</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small" required>
              <InputLabel>Destination Account (Transfer To)</InputLabel>
              <Select
                value={transferDest}
                label="Destination Account (Transfer To)"
                onChange={(e) => setTransferDest(e.target.value)}
              >
                {accounts.map((acc) => (
                  <MenuItem key={acc.id} value={String(acc.id)}>{acc.name} ({formatINR(acc.balance)})</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Amount"
              type="number"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              required
            />
            <TextField
              size="small"
              label="Transfer Date"
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              required
            />
            <TextField
              size="small"
              label="Transfer Reason"
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder="e.g. Petty cash replenishment"
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setTransferModal(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => transferMutation.mutate()}
            disabled={transferMutation.isPending}
          >
            {transferMutation.isPending ? 'Transferring…' : 'Execute Transfer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
