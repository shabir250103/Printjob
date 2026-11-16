import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Box, Button } from '@mui/material'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import { useLocation, useNavigate } from 'react-router'
import { api, apiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { RecordDialog } from '../components/RecordDialog'
import { ConvertToInJobDialog } from '../components/ConvertToInJobDialog'
import { OutJobForm } from '../components/OutJobForm'
import { PaymentCreateForm } from '../components/PaymentCreateForm'
import { PageHeader } from '../components/PageHeader'
import { resources } from '../config/resources'
import type { ApiRecord } from '../types'

export function ResourceCreatePage({ resourceKey }: { resourceKey: string }) {
  const config = resources[resourceKey]
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { refresh, can } = useAuth()
  const sourceEnquiry = resourceKey === 'pipeline'
    ? (location.state as { sourceEnquiry?: ApiRecord } | null)?.sourceEnquiry
    : undefined
  const pipelineDraft: ApiRecord | undefined = sourceEnquiry ? {
    id: -1,
    client_name: sourceEnquiry.customer_name,
    customer: sourceEnquiry.customer ?? null,
    contact_number: sourceEnquiry.contact_number ?? '',
    job_date: sourceEnquiry.follow_up_date,
    job_type: sourceEnquiry.job_type,
    size: sourceEnquiry.size,
    quantity: sourceEnquiry.quantity,
    printing_method: sourceEnquiry.printing_method,
    quote: sourceEnquiry.quote,
    remarks: sourceEnquiry.remarks,
  } : undefined
  const [error, setError] = useState('')
  const returnPath = resourceKey === 'users' ? '/team-access?tab=users'
    : resourceKey === 'departments' ? '/team-access?tab=departments' : `/${resourceKey}`
  const [financeRequestKey] = useState(() => crypto.randomUUID())
  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (resourceKey === 'finance') payload = { ...payload, request_key: financeRequestKey }
      if (resourceKey === 'pipeline' && sourceEnquiry?.id) payload = { ...payload, source_enquiry: sourceEnquiry.id }
      const hasFile = Object.values(payload).some((value) => value instanceof File || (Array.isArray(value) && value.some((item) => item instanceof File)))
      const body = hasFile ? new FormData() : payload
      if (body instanceof FormData) Object.entries(payload).forEach(([key, value]) => {
        if (Array.isArray(value)) value.forEach((item) => body.append(key, item instanceof File ? item : String(item)))
        else body.append(key, value instanceof File ? value : String(value))
      })
      return (await api.post(config.endpoint, body, hasFile ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined)).data
    },
    onSuccess: async (saved: ApiRecord) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['resource'] }),
        queryClient.invalidateQueries({ queryKey: ['form-lookups'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['machine-daily'] }),
      ])
      if (resourceKey === 'users') await refresh()
      if (resourceKey === 'out-jobs') {
        const createdOffer = { kind: 'out', jobNumber: String(saved.job_number || `#${saved.id}`) }
        navigate(can('jobboard') ? '/job-board' : '/out-jobs', { replace: true, state: { createdOffer } })
        return
      }
      if (resourceKey === 'customer-payments' && saved.delivery_status === 'ready') {
        navigate('/deliveries', { replace: true, state: { paymentNotice: `${String(saved.job_number || 'Job')} is fully paid. Its Ready delivery is available.` } })
        return
      }
      navigate(returnPath, { replace: true })
    },
    onError: (reason) => setError(apiError(reason)),
  })

  if (config.readOnly) return <Alert severity="warning">This resource cannot be created.</Alert>
  return <>
    <Box sx={{ mb: 2 }}><Button startIcon={<ArrowBackRounded />} onClick={() => navigate(returnPath)}>Back to {config.title}</Button></Box>
    <PageHeader eyebrow="Create" title={config.singular} description={`Enter the details for a new ${config.singular.toLowerCase()}.`} />
    {resourceKey === 'in-jobs'
      ? <ConvertToInJobDialog standalone page pending={save.isPending} error={error}
          onClose={() => navigate(`/${resourceKey}`)} onSave={(data) => save.mutate(data)} />
      : resourceKey === 'out-jobs'
        ? <OutJobForm pending={save.isPending} error={error} onClose={() => navigate(`/${resourceKey}`)} onSave={(data) => save.mutate(data)} />
      : resourceKey === 'customer-payments' || resourceKey === 'vendor-payments'
        ? <PaymentCreateForm kind={resourceKey === 'customer-payments' ? 'customer' : 'vendor'} pending={save.isPending} error={error}
            onClose={() => navigate(`/${resourceKey}`)} onSave={(data) => save.mutate(data)} />
      : <RecordDialog page open title="Details" fields={config.fields} pending={save.isPending} error={error}
          record={pipelineDraft} onClose={() => navigate(`/${resourceKey}`)} onSave={(data) => save.mutate(data)} />}
  </>
}
