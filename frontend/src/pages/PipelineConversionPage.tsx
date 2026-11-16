import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Box, Button, CircularProgress } from '@mui/material'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import { useNavigate, useParams } from 'react-router'
import { api, apiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ConvertToInJobDialog } from '../components/ConvertToInJobDialog'
import { OutJobForm } from '../components/OutJobForm'
import { PageHeader } from '../components/PageHeader'
import type { ApiRecord } from '../types'

export function PipelineConversionPage({ kind }: { kind: 'in' | 'out' }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const pipeline = useQuery({
    queryKey: ['pipeline-conversion', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get<ApiRecord>(`/pipeline-jobs/${id}/`)).data,
  })
  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post(`/pipeline-jobs/${id}/convert-to-${kind}-job/`, payload)).data,
    onSuccess: async (saved: ApiRecord) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['resource'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['pipeline-conversion', id] }),
        ...(kind === 'in' ? [queryClient.invalidateQueries({ queryKey: ['machine-daily'] })] : []),
      ])
      if (kind === 'out') {
        const createdOffer = { kind: 'out', jobNumber: String(saved.job_number || `#${saved.id}`) }
        navigate(can('jobboard') ? '/job-board' : '/pipeline', { replace: true, state: { createdOffer } })
      } else navigate('/pipeline', { replace: true })
    },
    onError: (reason) => setError(apiError(reason)),
  })
  const cancel = () => navigate('/pipeline')

  return <>
    <Box sx={{ mb: 2 }}><Button startIcon={<ArrowBackRounded />} onClick={cancel}>Back to Pipeline</Button></Box>
    <PageHeader eyebrow="Pipeline conversion" title={kind === 'in' ? 'Create In Job' : 'Create Out Job'}
      description={pipeline.data ? `From ${String(pipeline.data.job_number)} — ${String(pipeline.data.client_name)}` : 'Load the Pipeline job to continue.'} />
    {pipeline.isLoading && <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>}
    {pipeline.isError && <Alert severity="error">{apiError(pipeline.error)}</Alert>}
    {pipeline.data && (kind === 'in'
      ? <ConvertToInJobDialog page row={pipeline.data} pending={save.isPending} error={error} onClose={cancel} onSave={(data) => save.mutate(data)} />
      : <OutJobForm row={pipeline.data} pending={save.isPending} error={error} onClose={cancel} onSave={(data) => save.mutate(data)} />)}
  </>
}
