import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Autocomplete, Box, Button, Card, CircularProgress, MenuItem, TextField, Typography } from '@mui/material'
import { api, apiError } from '../api/client'

type JobOption = {
  id: number
  kind: 'in' | 'out'
  job_number: string
  customer_name: string
  job_type: string
  vendor?: string
  balance: string
}
type CashAccountOption = { id: number; name: string }
type Options = { jobs: JobOption[]; cash_accounts: CashAccountOption[] }

const today = () => {
  const date = new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function PaymentCreateForm({ kind, pending, error, onClose, onSave }: {
  kind: 'customer' | 'vendor'
  pending: boolean
  error: string
  onClose: () => void
  onSave: (payload: Record<string, unknown>) => void
}) {
  const [job, setJob] = useState<JobOption | null>(null)
  const [amount, setAmount] = useState('')
  const [paymentType, setPaymentType] = useState('payment')
  const [paymentDate, setPaymentDate] = useState(today)
  const [method, setMethod] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [cashAccount, setCashAccount] = useState('')
  const [validation, setValidation] = useState('')
  const options = useQuery({
    queryKey: ['payment-job-options', kind],
    queryFn: async () => (await api.get<Options>(`/${kind}-payments/job-options/`)).data,
  })
  const vendor = kind === 'vendor'
  const label = (option: JobOption) => [
    option.job_number || `${option.kind.toUpperCase()} #${option.id}`,
    option.customer_name,
    vendor ? option.vendor : option.job_type,
    `₹${Number(option.balance).toFixed(2)} ${vendor ? 'owed' : 'due'}`,
  ].filter(Boolean).join(' — ')

  const handleMethodChange = (newMethod: string) => {
    setMethod(newMethod)
    const accounts = options.data?.cash_accounts || []
    if (accounts.length > 0) {
      if (newMethod.toLowerCase().includes('god')) {
        const godAcc = accounts.find((a: any) => (a as any).account_type === 'first_payment' || a.name.toLowerCase().includes('god'))
        if (godAcc) setCashAccount(String(godAcc.id))
      } else if (newMethod.toLowerCase().includes('petty') || newMethod.toLowerCase().includes('cash')) {
        const pettyAcc = accounts.find((a: any) => (a as any).account_type === 'petty' || a.name.toLowerCase().includes('petty'))
        if (pettyAcc) setCashAccount(String(pettyAcc.id))
      } else if (newMethod.toLowerCase().includes('upi') || newMethod.toLowerCase().includes('bank') || newMethod.toLowerCase().includes('neft') || newMethod.toLowerCase().includes('cheque') || newMethod.toLowerCase().includes('card')) {
        const bankAcc = accounts.find((a: any) => (a as any).account_type === 'net_bank' || a.name.toLowerCase().includes('bank'))
        if (bankAcc) setCashAccount(String(bankAcc.id))
      }
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!job) { setValidation('Select a job first.'); return }
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) { setValidation('Enter an amount greater than zero.'); return }
    if (Number(amount) > Number(job.balance)) { setValidation('Amount cannot exceed the outstanding balance.'); return }
    if (vendor && cashAccount) {
      const chosen = (options.data?.cash_accounts || []).find((a) => String(a.id) === cashAccount)
      if (chosen && chosen.name.toLowerCase().includes('god')) {
        setValidation("First Payment (God's Account) is a sacred reserve and cannot be used for vendor payouts.")
        return
      }
    }
    setValidation('')
    onSave({
      ...(vendor ? { out_job: job.id } : { job_type: job.kind, job_id: job.id, payment_type: paymentType }),
      amount, payment_date: paymentDate, method, reference_no: referenceNo,
      ...(cashAccount ? { cash_account: Number(cashAccount) } : {}),
    })
  }

  return <Card component="form" onSubmit={submit} sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, md: 3 } }}>
    <Typography variant="h6" sx={{ mb: 2 }}>Payment details</Typography>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {validation && <Alert severity="error" sx={{ mb: 2 }}>{validation}</Alert>}
    {options.isError && <Alert severity="error" sx={{ mb: 2 }}>Could not load jobs: {apiError(options.error)}</Alert>}
    {options.isLoading ? <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box> : <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
        <Autocomplete
          sx={{ gridColumn: '1 / -1' }}
          options={options.data?.jobs || []}
          value={job}
          onChange={(_event, value) => { setJob(value); setValidation('') }}
          getOptionLabel={label}
          isOptionEqualToValue={(option, value) => option.id === value.id && option.kind === value.kind}
          renderInput={(params) => <TextField {...params} label={vendor ? 'Out Job' : 'In Job or Out Job'} placeholder="Search job number, customer or type" required />}
        />
        {job && <Alert severity="info" sx={{ gridColumn: '1 / -1' }}>Outstanding balance: ₹{Number(job.balance).toFixed(2)}</Alert>}
        <TextField label="Amount" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} required
          slotProps={{ htmlInput: { min: '0.01', step: '0.01' } }} />
        {!vendor && <TextField select label="Payment type" value={paymentType} onChange={(event) => setPaymentType(event.target.value)}>
          <MenuItem value="advance">Advance</MenuItem><MenuItem value="payment">Payment</MenuItem><MenuItem value="balance">Balance payment</MenuItem>
        </TextField>}
        <TextField label="Payment date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required slotProps={{ inputLabel: { shrink: true } }} />
        <TextField select label="Method" value={method} onChange={(event) => handleMethodChange(event.target.value)}>
          <MenuItem value="Petty Cash">💵 Petty Cash</MenuItem>
          <MenuItem value="UPI / GPay">📱 UPI / GPay</MenuItem>
          <MenuItem value="Net Banking / NEFT">🏦 Net Banking / NEFT</MenuItem>
          {!vendor && <MenuItem value="First Payment to God">🙏 First Payment to God (Sacred Reserve)</MenuItem>}
          <MenuItem value="Cheque">📄 Cheque</MenuItem>
          <MenuItem value="Card">💳 Card</MenuItem>
        </TextField>
        <TextField label="Reference number" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} />
        <TextField select label="Cash account (optional)" value={cashAccount} onChange={(event) => setCashAccount(event.target.value)}>
          <MenuItem value="">Auto-select based on method</MenuItem>
          {(options.data?.cash_accounts || []).map((account: any) => (
            <MenuItem key={account.id} value={String(account.id)}>
              {account.account_type === 'first_payment' || account.name.toLowerCase().includes('god') ? '🙏 ' : account.name.toLowerCase().includes('petty') ? '💵 ' : '💳 '}
              {account.name}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 3 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={pending || options.isError}>{pending ? 'Saving…' : 'Save payment'}</Button>
      </Box>
    </>}
  </Card>
}
