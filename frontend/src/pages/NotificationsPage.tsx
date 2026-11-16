import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Divider, MenuItem,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import DoneAllRounded from '@mui/icons-material/DoneAllRounded'
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded'
import { api, apiError } from '../api/client'
import { PageHeader } from '../components/PageHeader'

interface Notice {
  id: number
  title: string
  message: string
  notification_type: string
  target_url: string
  is_read: boolean
  created_at: string
}

const types = [
  { value: '', label: 'All types' },
  { value: 'job', label: 'Jobs' },
  { value: 'stock', label: 'Stock' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'payment', label: 'Payment' },
  { value: 'system', label: 'System' },
]

export function NotificationsPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const read = searchParams.get('read') || 'all'
  const type = searchParams.get('type') || ''
  const updateFilter = (key: 'read' | 'type', value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'all' || !value) next.delete(key)
    else next.set(key, value)
    setSearchParams(next)
  }

  const query = useQuery({
    queryKey: ['notifications', 'list', read, type],
    queryFn: async () => (await api.get<Notice[]>('/notifications/', {
      params: { ...(read !== 'all' ? { read } : {}), ...(type ? { type } : {}) },
    })).data,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  const markAll = useMutation({ mutationFn: () => api.post('/notifications/mark-all-read/'), onSuccess: refresh })
  const markOne = useMutation({ mutationFn: (id: number) => api.post(`/notifications/${id}/mark-read/`), onSuccess: refresh })

  return <>
    <PageHeader title="Notifications" description="Updates addressed to your account across jobs, stock, delivery, and payments." />
    <Card>
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <ToggleButtonGroup size="small" exclusive value={read} onChange={(_event, value: string | null) => value && updateFilter('read', value)} aria-label="Notification read status">
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="false">Unread</ToggleButton>
            <ToggleButton value="true">Read</ToggleButton>
          </ToggleButtonGroup>
          <TextField select label="Type" size="small" value={type} onChange={(event) => updateFilter('type', event.target.value)} sx={{ minWidth: 145 }}>
            {types.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </TextField>
        </Box>
        <Button size="small" startIcon={<DoneAllRounded />} onClick={() => markAll.mutate()} disabled={markAll.isPending}>Mark all read</Button>
      </Box>
      <Divider />
      {query.isLoading && <Box sx={{ minHeight: 260, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>}
      {query.isError && <Alert severity="error" sx={{ m: 2 }}>{apiError(query.error)}</Alert>}
      {query.data?.length === 0 && <Box sx={{ minHeight: 260, display: 'grid', placeItems: 'center', textAlign: 'center', px: 2 }}><Box><NotificationsNoneRounded sx={{ fontSize: 48, color: 'text.disabled' }} /><Typography fontWeight={800}>No matching notifications</Typography><Typography color="text.secondary" fontSize={13}>Try another read status or type.</Typography></Box></Box>}
      {query.data?.map((notice, index) => <Box key={notice.id}>
        <Box onClick={() => !notice.is_read && markOne.mutate(notice.id)} sx={{ p: 2.2, display: 'flex', gap: 2, cursor: notice.is_read ? 'default' : 'pointer', bgcolor: notice.is_read ? 'transparent' : 'rgba(239,108,62,.035)', '&:hover': { bgcolor: 'rgba(23,33,43,.025)' } }}>
          <Box className="status-dot" sx={{ mt: .8, bgcolor: notice.is_read ? 'divider' : 'primary.main', flexShrink: 0 }} />
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}><Typography fontWeight={notice.is_read ? 600 : 800}>{notice.title}</Typography><Typography fontSize={11.5} color="text.secondary" whiteSpace="nowrap">{new Date(notice.created_at).toLocaleString('en-IN')}</Typography></Box>
            <Typography fontSize={13} color="text.secondary" sx={{ mt: .4 }}>{notice.message}</Typography>
            <Chip size="small" variant="outlined" label={notice.notification_type} sx={{ mt: 1, textTransform: 'capitalize' }} />
          </Box>
        </Box>
        {index < (query.data?.length || 0) - 1 && <Divider />}
      </Box>)}
    </Card>
  </>
}
