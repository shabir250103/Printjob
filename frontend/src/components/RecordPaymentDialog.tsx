import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material'
import PaymentsRounded from '@mui/icons-material/PaymentsRounded'
import CallReceivedRounded from '@mui/icons-material/CallReceivedRounded'
import CallMadeRounded from '@mui/icons-material/CallMadeRounded'
import { api, apiError } from '../api/client'
import type { ApiRecord } from '../types'

interface Props {
  job: ApiRecord | null
  kind: 'in' | 'out'
  initialTarget?: 'customer' | 'vendor'
  onClose: () => void
  onSuccess?: () => void
}

function formatINR(val: number | string | undefined | null) {
  return `₹${Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function RecordPaymentDialog({ job, kind, initialTarget = 'customer', onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const isOutJob = kind === 'out'
  const [target, setTarget] = useState<'customer' | 'vendor'>(initialTarget)

  const totalAmount = Number(job?.total_amount || 0)
  const advancePaid = Number(job?.advance || 0)
  const customerBalance = Math.max(0, totalAmount - advancePaid)

  const vendorTotal = Number(job?.vendor_total_payment || 0)
  const vendorAdvance = Number(job?.vendor_advance || 0)
  const vendorBalance = Math.max(0, vendorTotal - vendorAdvance)

  const defaultAmount = target === 'customer' ? customerBalance : vendorBalance

  const [amount, setAmount] = useState(() => String(defaultAmount > 0 ? defaultAmount : ''))
  const [paymentType, setPaymentType] = useState('payment')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [cashAccount, setCashAccount] = useState('')
  const [method, setMethod] = useState('Cash')
  const [referenceNo, setReferenceNo] = useState('')
  const [error, setError] = useState('')

  // Sync state when job or initialTarget changes
  useEffect(() => {
    const nextTarget = initialTarget || 'customer'
    setTarget(nextTarget)
    const nextBal = nextTarget === 'customer' ? customerBalance : vendorBalance
    setAmount(nextBal > 0 ? String(nextBal) : '')
    setError('')
  }, [job?.id, initialTarget, customerBalance, vendorBalance])

  const accountsQuery = useQuery({
    queryKey: ['cash-accounts-active'],
    queryFn: async () => (await api.get<Array<{ id: number; name: string; balance: number }>>('/cash-accounts/')).data,
  })

  // Auto-select first cash account if none selected
  const accounts = accountsQuery.data || []
  const effectiveAccount = cashAccount || (accounts.length > 0 ? String(accounts[0].id) : '')

  const handleMethodChange = (newMethod: string) => {
    setMethod(newMethod)
    if (accounts.length > 0) {
      if (newMethod.toLowerCase().includes('god')) {
        const godAcc = accounts.find((a: any) => a.account_type === 'first_payment' || a.name.toLowerCase().includes('god'))
        if (godAcc) setCashAccount(String(godAcc.id))
      } else if (newMethod.toLowerCase().includes('petty') || newMethod.toLowerCase().includes('cash')) {
        const pettyAcc = accounts.find((a: any) => a.account_type === 'petty' || a.name.toLowerCase().includes('petty'))
        if (pettyAcc) setCashAccount(String(pettyAcc.id))
      } else if (newMethod.toLowerCase().includes('upi') || newMethod.toLowerCase().includes('bank') || newMethod.toLowerCase().includes('neft') || newMethod.toLowerCase().includes('cheque') || newMethod.toLowerCase().includes('card')) {
        const bankAcc = accounts.find((a: any) => a.account_type === 'net_bank' || a.name.toLowerCase().includes('bank'))
        if (bankAcc) setCashAccount(String(bankAcc.id))
      }
    }
  }

  const handleTabChange = (newTarget: 'customer' | 'vendor') => {
    setTarget(newTarget)
    const newBal = newTarget === 'customer' ? customerBalance : vendorBalance
    setAmount(newBal > 0 ? String(newBal) : '')
    setError('')
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!job) throw new Error('No job selected.')
      const numAmount = Number(amount)
      if (isNaN(numAmount) || numAmount <= 0) throw new Error('Enter a valid amount greater than 0.')

      if (target === 'customer') {
        if (numAmount > customerBalance) {
          throw new Error(`Amount cannot exceed outstanding customer balance of ${formatINR(customerBalance)}.`)
        }
        await api.post('/customer-payments/', {
          job_type: kind,
          job_id: job.id,
          amount: numAmount,
          payment_type: paymentType,
          payment_date: paymentDate,
          method,
          reference_no: referenceNo || null,
          cash_account: effectiveAccount ? Number(effectiveAccount) : null,
        })
      } else {
        const chosenAcc = accounts.find((a: any) => String(a.id) === effectiveAccount)
        if (chosenAcc && ((chosenAcc as any).account_type === 'first_payment' || chosenAcc.name.toLowerCase().includes('god'))) {
          throw new Error("First Payment (God's Account) is a sacred reserve and cannot be used for vendor payouts.")
        }
        if (numAmount > vendorBalance) {
          throw new Error(`Amount cannot exceed outstanding vendor balance of ${formatINR(vendorBalance)}.`)
        }
        await api.post('/vendor-payments/', {
          out_job: job.id,
          amount: numAmount,
          payment_date: paymentDate,
          method,
          reference_no: referenceNo || null,
          cash_account: effectiveAccount ? Number(effectiveAccount) : null,
        })
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['resource'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['finance-unified-ledger'] }),
      ])
      onSuccess?.()
      onClose()
    },
    onError: (err) => setError(apiError(err)),
  })

  if (!job) return null

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
        Record Payment — {String(job.job_number || `#${job.id}`)}
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {isOutJob && (
          <Tabs
            value={target}
            onChange={(_e, val) => handleTabChange(val)}
            sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            <Tab
              value="customer"
              label="Customer Receipt (Credit)"
              icon={<CallReceivedRounded />}
              iconPosition="start"
              sx={{ fontWeight: 700 }}
            />
            <Tab
              value="vendor"
              label="Vendor Payout (Debit)"
              icon={<CallMadeRounded />}
              iconPosition="start"
              sx={{ fontWeight: 700 }}
            />
          </Tabs>
        )}

        {/* Financial Context Banner */}
        <Card variant="outlined" sx={{ mb: 2.5, bgcolor: target === 'customer' ? 'rgba(47, 143, 99, 0.05)' : 'rgba(217, 56, 30, 0.05)' }}>
          <CardContent sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography fontSize={13} color="text.secondary">
                {target === 'customer' ? 'Customer:' : 'Supplier / Vendor:'}
              </Typography>
              <Typography fontSize={13} fontWeight={750}>
                {target === 'customer' ? String(job.customer_name || 'Customer') : String(job.vendor || 'Supplier')}
              </Typography>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, textAlign: 'center', pt: 1, borderTop: '1px dashed', borderColor: 'divider' }}>
              <Box>
                <Typography fontSize={11} color="text.secondary">TOTAL</Typography>
                <Typography fontSize={14} fontWeight={800}>
                  {formatINR(target === 'customer' ? totalAmount : vendorTotal)}
                </Typography>
              </Box>
              <Box>
                <Typography fontSize={11} color="text.secondary">ALREADY PAID</Typography>
                <Typography fontSize={14} fontWeight={800} color={target === 'customer' ? 'success.main' : 'warning.main'}>
                  {formatINR(target === 'customer' ? advancePaid : vendorAdvance)}
                </Typography>
              </Box>
              <Box>
                <Typography fontSize={11} color="text.secondary">PENDING</Typography>
                <Typography fontSize={14} fontWeight={800} color="error.main">
                  {formatINR(target === 'customer' ? customerBalance : vendorBalance)}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Stack spacing={2}>
          <TextField
            label="Payment Amount (₹)"
            type="number"
            size="small"
            required
            fullWidth
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            slotProps={{
              htmlInput: { min: 0.01, step: '0.01' },
            }}
            helperText={`Maximum payable: ${formatINR(defaultAmount)}`}
          />

          {target === 'customer' && (
            <FormControl size="small" fullWidth>
              <InputLabel>Payment Category</InputLabel>
              <Select
                value={paymentType}
                label="Payment Category"
                onChange={(e) => setPaymentType(e.target.value)}
              >
                <MenuItem value="advance">Advance Payment</MenuItem>
                <MenuItem value="payment">Intermediate Payment</MenuItem>
                <MenuItem value="balance">Final Balance Clearance</MenuItem>
              </Select>
            </FormControl>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <TextField
              label="Payment Date"
              type="date"
              size="small"
              required
              fullWidth
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />

            <FormControl size="small" fullWidth>
              <InputLabel>Payment Mode</InputLabel>
              <Select
                value={method}
                label="Payment Mode"
                onChange={(e) => handleMethodChange(e.target.value)}
              >
                <MenuItem value="Petty Cash">💵 Petty Cash</MenuItem>
                <MenuItem value="UPI / GPay">📱 UPI / GPay</MenuItem>
                <MenuItem value="Bank Transfer">🏦 Net Banking / NEFT</MenuItem>
                {target === 'customer' && <MenuItem value="First Payment to God">🙏 First Payment to God (Sacred Reserve)</MenuItem>}
                <MenuItem value="Cheque">📄 Cheque</MenuItem>
                <MenuItem value="Card">💳 Card</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <FormControl size="small" fullWidth>
            <InputLabel>Deposit / Pay from Account</InputLabel>
            <Select
              value={effectiveAccount}
              label="Deposit / Pay from Account"
              onChange={(e) => setCashAccount(e.target.value)}
            >
              {accounts.map((acc: any) => (
                <MenuItem key={acc.id} value={String(acc.id)}>
                  {acc.account_type === 'first_payment' ? '🙏 ' : acc.account_type === 'petty' ? '💵 ' : '💳 '}
                  {acc.name} ({formatINR(acc.balance)})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Reference / Transaction No. (Optional)"
            size="small"
            fullWidth
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            placeholder="e.g. UPI Ref, Cheque No, Bank UTR"
          />
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
        <Button
          variant="contained"
          color={target === 'customer' ? 'success' : 'warning'}
          startIcon={mutation.isPending ? <CircularProgress size={16} /> : <PaymentsRounded />}
          disabled={mutation.isPending || !amount || Number(amount) <= 0}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Posting…' : `Save ${target === 'customer' ? 'Customer Receipt' : 'Vendor Payment'}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
