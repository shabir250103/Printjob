import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, LinearProgress,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import PrintRounded from '@mui/icons-material/PrintRounded'
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded'
import BoltRounded from '@mui/icons-material/BoltRounded'
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded'
import AccountBalanceWalletRounded from '@mui/icons-material/AccountBalanceWalletRounded'
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded'
import CallMadeRounded from '@mui/icons-material/CallMadeRounded'
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded'
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded'
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import BarChartRounded from '@mui/icons-material/BarChartRounded'
import DonutLargeRounded from '@mui/icons-material/DonutLargeRounded'
import { BarChart, PieChart } from '@mui/x-charts'

import { api, apiError } from '../api/client'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../auth/AuthContext'
import type { ApiRecord, DashboardData } from '../types'

function formatINR(val: number | string) {
  return `₹${Number(val || 0).toLocaleString('en-IN')}`
}

function statusColor(status: string) {
  if (status === 'completed' || status === 'delivered') return 'success'
  if (status === 'urgent' || status === 'cancelled') return 'error'
  if (status === 'in_progress') return 'primary'
  return 'warning'
}

export function DashboardPage() {
  const { auth, can, canShowPayments } = useAuth()
  const navigate = useNavigate()
  const [chartMode, setChartMode] = useState<'orders' | 'finance'>('orders')

  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/dashboard/')).data,
    refetchInterval: 15_000,
  })

  const jobs = useQuery({
    queryKey: ['dashboard-jobs'],
    queryFn: async () => {
      const [inJobs, outJobs] = await Promise.all([
        can('injobs') ? api.get<ApiRecord[]>('/in-jobs/') : Promise.resolve({ data: [] as ApiRecord[] }),
        can('outjobs') ? api.get<ApiRecord[]>('/out-jobs/') : Promise.resolve({ data: [] as ApiRecord[] }),
      ])
      const merged: Array<ApiRecord & { route: string; stage: unknown }> = [
        ...inJobs.data.map((job) => ({ ...job, route: 'In house', stage: job.printing_status })),
        ...outJobs.data.map((job) => ({ ...job, route: 'Vendor', stage: job.status })),
      ]
      return merged.sort((a, b) => b.id - a.id).slice(0, 7)
    },
  })

  const firstName = auth?.user.first_name || auth?.user.username || 'there'

  if (dashboard.isLoading) return <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>
  if (dashboard.isError) return <Alert severity="error">{apiError(dashboard.error)}</Alert>
  const data = dashboard.data!

  const operationalCards = [
    {
      key: 'printing',
      label: 'In Production',
      value: data.printing,
      note: 'Jobs active on printing/finishing',
      icon: PrintRounded,
      color: '#167d89',
      to: '/in-jobs?printing_status=in_progress',
      permission: 'injobs',
    },
    {
      key: 'delivered',
      label: 'Delivered',
      value: data.delivered,
      note: 'Completed dispatches to clients',
      icon: LocalShippingRounded,
      color: '#2f8f63',
      to: '/deliveries?status=delivered',
      permission: 'delivery',
    },
    {
      key: 'action_required',
      label: 'Action Required',
      value: data.action_required_count || 0,
      note: 'Urgent, overdue or held on payment',
      icon: WarningAmberRounded,
      color: (data.action_required_count || 0) > 0 ? '#d9381e' : '#2f8f63',
      to: '#immediate-action',
      permission: 'injobs',
    },
    {
      key: 'low_stock',
      label: 'Low Stock Alert',
      value: data.low_stock_items,
      note: 'Materials at or below reorder mark',
      icon: Inventory2Rounded,
      color: data.low_stock_items > 0 ? '#ef6c3e' : '#2f8f63',
      to: '/stock?low_stock=true',
      permission: 'stock',
    },
  ] as const

  const pieData = (data.stages_breakdown || []).filter((s) => s.value > 0)

  return (
    <>
      <PageHeader
        eyebrow="Operations & Financial Overview"
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${firstName}`}
        description="Live view of work in flight, interactive trends, urgent items, inventory alerts, and financial balances."
      />

      {/* 1. FINANCIAL & AMOUNT DATA (Restricted to Finance / Superadmin) */}
      {canShowPayments && data.has_finance_access && (
        <Box sx={{ mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'text.secondary', fontSize: 11.5 }}>
              Financial & Liquidity Snapshot
            </Typography>
            <Chip size="small" variant="outlined" label="Live Balances" sx={{ fontSize: 11, height: 20 }} />
          </Box>
          <Box className="metric-grid">
            {/* Available Liquidity */}
            <Card
              onClick={() => navigate('/cash-transactions')}
              sx={{ cursor: 'pointer', transition: 'transform .2s, box-shadow .2s', '&:hover': { transform: 'translateY(-3px)', boxShadow: 4 } }}
            >
              <CardContent sx={{ p: '18px !important' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography color="text.secondary" fontSize={12} fontWeight={650}>Available Liquidity</Typography>
                    <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 800, color: '#167d89' }}>
                      {formatINR(data.available_cash)}
                    </Typography>
                  </Box>
                  <Box sx={{ width: 38, height: 38, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(22, 125, 137, 0.12)', color: '#167d89' }}>
                    <AccountBalanceWalletRounded fontSize="small" />
                  </Box>
                </Box>
                <Stack direction="row" spacing={0.6} sx={{ mt: 1.2, flexWrap: 'wrap', gap: 0.4 }}>
                  {data.cash_accounts?.map((acc) => (
                    <Chip key={acc.id} size="small" label={`${acc.name}: ${formatINR(acc.balance)}`} sx={{ fontSize: 10, height: 20, bgcolor: 'background.default' }} />
                  ))}
                </Stack>
              </CardContent>
            </Card>

            {/* Customer Receivables */}
            <Card
              onClick={() => navigate('/finance')}
              sx={{ cursor: 'pointer', transition: 'transform .2s, box-shadow .2s', '&:hover': { transform: 'translateY(-3px)', boxShadow: 4 } }}
            >
              <CardContent sx={{ p: '18px !important' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography color="text.secondary" fontSize={12} fontWeight={650}>Customer Receivables</Typography>
                    <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 800, color: '#d9381e' }}>
                      {formatINR(data.total_receivables)}
                    </Typography>
                  </Box>
                  <Box sx={{ width: 38, height: 38, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(217, 56, 30, 0.12)', color: '#d9381e' }}>
                    <HourglassTopRounded fontSize="small" />
                  </Box>
                </Box>
                <Typography color="text.secondary" fontSize={11.5} sx={{ mt: 1.4 }}>
                  {data.pending_payments} jobs awaiting customer settlement
                </Typography>
              </CardContent>
            </Card>

            {/* Vendor Payables */}
            <Card
              onClick={() => navigate('/finance')}
              sx={{ cursor: 'pointer', transition: 'transform .2s, box-shadow .2s', '&:hover': { transform: 'translateY(-3px)', boxShadow: 4 } }}
            >
              <CardContent sx={{ p: '18px !important' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography color="text.secondary" fontSize={12} fontWeight={650}>Vendor Payables</Typography>
                    <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 800, color: '#e67e22' }}>
                      {formatINR(data.total_payables)}
                    </Typography>
                  </Box>
                  <Box sx={{ width: 38, height: 38, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(230, 126, 34, 0.12)', color: '#e67e22' }}>
                    <CallMadeRounded fontSize="small" />
                  </Box>
                </Box>
                <Typography color="text.secondary" fontSize={11.5} sx={{ mt: 1.4 }}>
                  Outstanding payments to outsource suppliers
                </Typography>
              </CardContent>
            </Card>

            {/* Month Turnover */}
            <Card
              onClick={() => navigate('/reports')}
              sx={{ cursor: 'pointer', transition: 'transform .2s, box-shadow .2s', '&:hover': { transform: 'translateY(-3px)', boxShadow: 4 } }}
            >
              <CardContent sx={{ p: '18px !important' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography color="text.secondary" fontSize={12} fontWeight={650}>Month-to-Date Billed</Typography>
                    <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 800, color: '#2f8f63' }}>
                      {formatINR(data.month_revenue)}
                    </Typography>
                  </Box>
                  <Box sx={{ width: 38, height: 38, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(47, 143, 99, 0.12)', color: '#2f8f63' }}>
                    <TrendingUpRounded fontSize="small" />
                  </Box>
                </Box>
                <Typography color="text.secondary" fontSize={11.5} sx={{ mt: 1.4 }}>
                  {formatINR(data.month_collected)} customer receipts collected
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </Box>
      )}

      {/* 2. OPERATIONAL METRIC ROW */}
      <Box className="metric-grid">
        {operationalCards.map(({ key, label, value, note, icon: Icon, color, to, permission }) => (
          <Card
            key={key}
            onClick={to.startsWith('/') && can(permission) ? () => navigate(to) : undefined}
            sx={{
              cursor: to.startsWith('/') && can(permission) ? 'pointer' : 'default',
              transition: 'transform .2s, box-shadow .2s',
              '&:hover': to.startsWith('/') && can(permission) ? { transform: 'translateY(-3px)', boxShadow: 4 } : undefined,
            }}
          >
            <CardContent sx={{ p: '20px !important' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography color="text.secondary" fontSize={13} fontWeight={650}>{label}</Typography>
                  <Typography variant="h4" sx={{ mt: 0.8, fontSize: 30, fontWeight: 800 }}>{value}</Typography>
                </Box>
                <Box sx={{ width: 42, height: 42, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: `${color}15`, color }}>
                  <Icon />
                </Box>
              </Box>
              <Typography color="text.secondary" fontSize={11.5} sx={{ mt: 1.4 }}>{note}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* 3. DYNAMIC & INTERACTIVE CHARTS SECTION */}
      <Box sx={{ mt: 2.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.45fr 0.95fr' }, gap: 2.2 }}>

          {/* Chart 1: 7-Day Activity & Financial Trend */}
          <Card>
            <Box sx={{ p: 2.2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                <Box sx={{ width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(22, 125, 137, 0.12)', color: '#167d89' }}>
                  <BarChartRounded fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="subtitle1" fontWeight={800}>7-Day Operations & Trends</Typography>
                  <Typography fontSize={12} color="text.secondary">Daily volume comparison across production routes</Typography>
                </Box>
              </Box>

              {canShowPayments && data.has_finance_access && (
                <ToggleButtonGroup
                  size="small"
                  value={chartMode}
                  exclusive
                  onChange={(_e, val) => { if (val) setChartMode(val) }}
                  sx={{ height: 28 }}
                >
                  <ToggleButton value="orders" sx={{ fontSize: 11, px: 1.2, textTransform: 'none', fontWeight: 650 }}>
                    Order Volume
                  </ToggleButton>
                  <ToggleButton value="finance" sx={{ fontSize: 11, px: 1.2, textTransform: 'none', fontWeight: 650 }}>
                    Revenue vs Cash (₹)
                  </ToggleButton>
                </ToggleButtonGroup>
              )}
            </Box>
            <Divider />
            <Box sx={{ p: 1, width: '100%', overflowX: 'auto' }}>
              {chartMode === 'orders' ? (
                <BarChart
                  dataset={data.trend_days || []}
                  xAxis={[{ scaleType: 'band', dataKey: 'label' }]}
                  series={[
                    { dataKey: 'in_jobs', label: 'In-House Jobs', color: '#167d89' },
                    { dataKey: 'out_jobs', label: 'Outsourced Jobs', color: '#3b82f6' },
                  ]}
                  height={280}
                  borderRadius={6}
                />
              ) : (
                <BarChart
                  dataset={data.trend_days || []}
                  xAxis={[{ scaleType: 'band', dataKey: 'label' }]}
                  series={[
                    {
                      dataKey: 'revenue',
                      label: 'Order Value (₹)',
                      color: '#2f8f63',
                      valueFormatter: (v) => formatINR(v || 0),
                    },
                    {
                      dataKey: 'collected',
                      label: 'Cash Receipts (₹)',
                      color: '#167d89',
                      valueFormatter: (v) => formatINR(v || 0),
                    },
                  ]}
                  height={280}
                  borderRadius={6}
                />
              )}
            </Box>
          </Card>

          {/* Chart 2: Pipeline & Production Distribution Donut */}
          <Card>
            <Box sx={{ p: 2.2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                <Box sx={{ width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed' }}>
                  <DonutLargeRounded fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="subtitle1" fontWeight={800}>Work In Progress Distribution</Typography>
                  <Typography fontSize={12} color="text.secondary">Active load across operational stages</Typography>
                </Box>
              </Box>
              <Chip label={`${data.total_jobs} total`} size="small" sx={{ fontWeight: 700 }} />
            </Box>
            <Divider />
            <Box sx={{ p: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 280 }}>
              {pieData.length > 0 ? (
                <PieChart
                  series={[
                    {
                      data: pieData,
                      innerRadius: 48,
                      outerRadius: 90,
                      paddingAngle: 3,
                      cornerRadius: 5,
                      highlightScope: { fade: 'global', highlight: 'item' },
                    },
                  ]}
                  height={260}
                />
              ) : (
                <Box sx={{ textAlign: 'center', p: 3 }}>
                  <CheckCircleRounded sx={{ fontSize: 38, color: 'success.main', mb: 1 }} />
                  <Typography fontSize={13} color="text.secondary">No active production jobs in queue</Typography>
                </Box>
              )}
            </Box>
          </Card>

        </Box>
      </Box>

      {/* 4. JOBS REQUIRING IMMEDIATE ACTION & LOW STOCK ALERTS */}
      <Box id="immediate-action" sx={{ mt: 2.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.45fr 0.95fr' }, gap: 2.2 }}>

          {/* Action Required Card */}
          <Card sx={{ border: (data.action_required_count || 0) > 0 ? '1px solid rgba(217, 56, 30, 0.3)' : undefined }}>
            <Box sx={{ p: 2.2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: (data.action_required_count || 0) > 0 ? 'rgba(217, 56, 30, 0.04)' : undefined }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                <Box sx={{ width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(217, 56, 30, 0.14)', color: '#d9381e' }}>
                  <BoltRounded fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="subtitle1" fontWeight={800}>Jobs Requiring Immediate Action</Typography>
                  <Typography fontSize={12} color="text.secondary">Urgent in production, overdue, or delivery blocked on balance payment</Typography>
                </Box>
              </Box>
              <Chip
                label={`${data.action_required_jobs?.length || 0} active`}
                size="small"
                color={(data.action_required_jobs?.length || 0) > 0 ? 'error' : 'success'}
                sx={{ fontWeight: 700 }}
              />
            </Box>
            <Divider />
            {data.action_required_jobs && data.action_required_jobs.length > 0 ? (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Job No.</TableCell>
                      <TableCell>Customer</TableCell>
                      <TableCell>Attention Reason</TableCell>
                      <TableCell align="right">Due Balance</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.action_required_jobs.map((job) => (
                      <TableRow key={`${job.kind}-${job.id}`} hover>
                        <TableCell sx={{ fontWeight: 750 }}>
                          {job.job_number}
                          <Typography variant="caption" display="block" color="text.secondary">
                            {job.kind === 'in' ? 'In House' : 'Vendor'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{job.customer_name}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={job.reason}
                            color={
                              job.reason_code === 'payment_blocked' ? 'warning' :
                              job.reason_code === 'urgent' ? 'error' : 'secondary'
                            }
                            sx={{ fontWeight: 650, fontSize: 11 }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 750, color: job.balance > 0 ? '#d9381e' : 'text.primary' }}>
                          {formatINR(job.balance)}
                        </TableCell>
                        <TableCell align="center">
                          <Button
                            size="small"
                            variant="outlined"
                            endIcon={<ArrowForwardRounded fontSize="small" />}
                            onClick={() => navigate(`/${job.kind === 'in' ? 'in-jobs' : 'out-jobs'}?search=${encodeURIComponent(job.job_number)}`)}
                            sx={{ textTransform: 'none', py: 0.2, px: 1, fontSize: 11.5 }}
                          >
                            Open
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            ) : (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <CheckCircleRounded sx={{ fontSize: 42, color: 'success.main', mb: 1 }} />
                <Typography fontWeight={700}>All clear!</Typography>
                <Typography fontSize={12.5} color="text.secondary">No urgent priority, overdue, or payment-held jobs right now.</Typography>
              </Box>
            )}
          </Card>

          {/* Low Stock Inventory Alerts Card */}
          <Card sx={{ border: data.low_stock_items > 0 ? '1px solid rgba(239, 108, 62, 0.3)' : undefined }}>
            <Box sx={{ p: 2.2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: data.low_stock_items > 0 ? 'rgba(239, 108, 62, 0.04)' : undefined }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                <Box sx={{ width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(239, 108, 62, 0.14)', color: '#ef6c3e' }}>
                  <Inventory2Rounded fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="subtitle1" fontWeight={800}>Low Stock Inventory</Typography>
                  <Typography fontSize={12} color="text.secondary">Materials at or below minimum reserve</Typography>
                </Box>
              </Box>
              <Chip
                label={`${data.low_stock_items} low`}
                size="small"
                color={data.low_stock_items > 0 ? 'warning' : 'success'}
                sx={{ fontWeight: 700 }}
              />
            </Box>
            <Divider />
            {data.low_stock_list && data.low_stock_list.length > 0 ? (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Item</TableCell>
                      <TableCell align="right">Available</TableCell>
                      <TableCell align="right">Min Reserve</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.low_stock_list.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell sx={{ fontWeight: 700 }}>
                          {item.name}
                          <Typography variant="caption" display="block" color="text.secondary">
                            {item.category}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: item.current_stock <= 0 ? 'error.main' : 'warning.main' }}>
                          {item.current_stock} {item.unit}
                        </TableCell>
                        <TableCell align="right" color="text.secondary">
                          {item.min_stock} {item.unit}
                        </TableCell>
                        <TableCell align="center">
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => navigate(`/stock?search=${encodeURIComponent(item.name)}`)}
                            sx={{ textTransform: 'none', py: 0.2, px: 0.8, fontSize: 11.5 }}
                          >
                            Restock
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            ) : (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <CheckCircleRounded sx={{ fontSize: 42, color: 'success.main', mb: 1 }} />
                <Typography fontWeight={700}>Inventory Healthy</Typography>
                <Typography fontSize={12.5} color="text.secondary">All materials are currently above minimum threshold.</Typography>
              </Box>
            )}
            {data.low_stock_items > 0 && (
              <Box sx={{ p: 1.5, textAlign: 'center', bgcolor: 'background.default' }}>
                <Button size="small" onClick={() => navigate('/stock?low_stock=true')} endIcon={<ArrowForwardRounded fontSize="small" />}>
                  View All {data.low_stock_items} Low Stock Items
                </Button>
              </Box>
            )}
          </Card>
        </Box>
      </Box>

      {/* 5. RECENT JOBS STREAM */}
      <Box sx={{ mt: 2.5 }}>
        <Card>
          <Box sx={{ p: 2.4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h6" fontWeight={800}>Recent Work</Typography>
              <Typography fontSize={12.5} color="text.secondary">Latest orders across internal production and outsourcing</Typography>
            </Box>
            <Chip label={`${jobs.data?.length || 0} shown`} size="small" />
          </Box>
          <Divider />
          {jobs.isLoading ? <LinearProgress /> : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 620 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Job</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Route</TableCell>
                    <TableCell>Stage</TableCell>
                    <TableCell align="right">Total Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {jobs.data?.map((job) => (
                    <TableRow
                      key={`${job.route}-${job.id}`}
                      hover
                      onClick={() => navigate(`/${job.route === 'In house' ? 'in-jobs' : 'out-jobs'}?search=${encodeURIComponent(String(job.job_number || ''))}`)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell sx={{ fontWeight: 750 }}>{String(job.job_number || `#${job.id}`)}</TableCell>
                      <TableCell>{String(job.customer_name || '—')}</TableCell>
                      <TableCell>{String(job.route)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          color={statusColor(String(job.stage))}
                          label={String(job.stage || 'pending').replaceAll('_', ' ')}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {formatINR(Number(job.total_amount || 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Card>
      </Box>
    </>
  )
}
