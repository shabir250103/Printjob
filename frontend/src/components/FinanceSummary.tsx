import { useQuery } from '@tanstack/react-query'
import { Alert, Box, Button, Card, Typography } from '@mui/material'
import { Link } from 'react-router'
import { api, apiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'

type Summary = { credit: string; debit: string; expense: string; accounts: { id: number; name: string; balance: string }[] }
const money = (value: string) => Number(value).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })

export function FinanceSummary() {
  const { can } = useAuth()
  const query = useQuery({ queryKey: ['resource', 'finance-summary'], queryFn: async () => (await api.get<Summary>('/finance-entries/summary/')).data })
  return <Box sx={{ mb: 3 }}>
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
      <Button component={Link} to="/customer-payments">Customer receipts</Button>
      <Button component={Link} to="/vendor-payments">Supplier job payments</Button>
      {can('cash') && <><Button component={Link} to="/cash-transactions">Cash Book</Button><Button component={Link} to="/cash-accounts">Cash accounts</Button><Button component={Link} to="/cash-transfers">Transfers</Button></>}
    </Box>
    {query.isError && <Alert severity="error">{apiError(query.error)}</Alert>}
    {query.data && <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>All-time manual entries only (excluding job payments and transfers)</Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {(['credit', 'debit', 'expense'] as const).map((kind) => <Card key={kind} sx={{ p: 2, minWidth: 180 }}>
          <Typography sx={{ textTransform: 'capitalize' }}>{kind}</Typography><Typography variant="h6">{money(query.data![kind])}</Typography>
        </Card>)}
      </Box>
      <Typography sx={{ mt: 2 }} fontWeight={700}>Current active account balances (all cash movements)</Typography>
      {query.data.accounts.map((account) => <Typography key={account.id} variant="body2">{account.name}: {money(account.balance)}</Typography>)}
      {!query.data.accounts.length && <Alert severity="info">No active cash accounts. Ask a Cash-module administrator to create an account before posting entries.</Alert>}
    </>}
  </Box>
}
