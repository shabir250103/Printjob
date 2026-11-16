import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { CrudPage } from './CrudPage'
import { api } from '../api/client'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ auth: { user: { is_superuser: false, show_payment_details: false } }, canShowPayments: false, can: () => true, refresh: vi.fn() }),
  useOptionalAuth: () => ({ auth: { user: { is_superuser: false, show_payment_details: false } }, canShowPayments: false, can: () => true, refresh: vi.fn() }),
}))
vi.mock('../api/client', () => ({ api: { get: vi.fn(), patch: vi.fn() }, apiError: () => 'Request failed' }))

afterEach(() => { cleanup(); vi.resetAllMocks() })

it('staff can save an Out Job status without submitting hidden finance fields', async () => {
  const job = { id: 1, customer_name: 'Synthetic customer', vendor: 'Synthetic vendor', job_type: 'Cards',
    quantity: 10, status: 'in_progress', priority: 'normal', remarks: '' }
  vi.mocked(api.get).mockResolvedValue({ data: [job] })
  vi.mocked(api.patch).mockResolvedValue({ data: { ...job, status: 'completed', delivery_status: 'ready' } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter><CrudPage resourceKey="out-jobs" /></MemoryRouter></QueryClientProvider>)
  fireEvent.click(await screen.findByLabelText('Edit'))
  expect(screen.queryByLabelText('Customer total')).toBeNull()
  expect(screen.queryByLabelText('Vendor total')).toBeNull()
  expect(screen.queryByLabelText('Expenses')).toBeNull()
  fireEvent.mouseDown(screen.getByLabelText('Status'))
  fireEvent.click(await screen.findByRole('option', { name: 'Completed' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(api.patch).toHaveBeenCalled())
  const body = vi.mocked(api.patch).mock.calls[0][1] as Record<string, unknown>
  expect(body.status).toBe('completed')
  expect(body).not.toHaveProperty('total_amount')
  expect(body).not.toHaveProperty('vendor_total_payment')
  expect(body).not.toHaveProperty('expenses')
  await screen.findByText('Production is complete. A Ready delivery was created automatically.')
})
