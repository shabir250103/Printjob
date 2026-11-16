import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { RecordDialog } from './RecordDialog'

afterEach(cleanup)

it('submits intentionally cleared optional fields but not an empty password', () => {
  const save = vi.fn()
  render(<QueryClientProvider client={new QueryClient()}><RecordDialog page open title="Supplier" record={{ id: 1, notes: 'Old notes', password: '' }}
    fields={[{ name: 'notes', label: 'Notes' }, { name: 'password', label: 'Password', type: 'password' }]}
    onSave={save} onClose={() => {}} /></QueryClientProvider>)
  fireEvent.change(screen.getByLabelText('Notes'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(save).toHaveBeenCalledWith({ notes: '' })
})

it('accepts decimal finance amounts in number fields', () => {
  const save = vi.fn()
  render(<QueryClientProvider client={new QueryClient()}><RecordDialog page open title="Finance"
    fields={[{ name: 'amount', label: 'Amount', type: 'number', required: true }]}
    onSave={save} onClose={() => {}} /></QueryClientProvider>)
  const input = screen.getByLabelText(/Amount/) as HTMLInputElement
  fireEvent.change(input, { target: { value: '25.50' } })
  expect(input.validity.valid).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(save).toHaveBeenCalledWith({ amount: 25.5 })
})

it('omits advance from PATCH payload on edit and provides payment record button', () => {
  const save = vi.fn()
  const recordPayment = vi.fn()
  const existingJob = { id: 10, customer_name: 'Alpha Prints', advance: 500, balance: 1500, total_amount: 2000 }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RecordDialog
        page
        open
        title="Edit In Job"
        record={existingJob}
        fields={[
          { name: 'customer_name', label: 'Customer name' },
          { name: 'advance', label: 'Advance payment', type: 'number' },
        ]}
        onSave={save}
        onRecordPayment={recordPayment}
        onClose={() => {}}
      />
    </QueryClientProvider>
  )

  // Advance should not be rendered as an editable text input on edit
  expect(screen.queryByLabelText('Advance payment')).toBeNull()
  // The payment status summary card should be visible
  expect(screen.getByText('Customer Payment Status')).toBeTruthy()
  expect(screen.getByText(/Paid: ₹500/)).toBeTruthy()
  expect(screen.getByText(/Pending: ₹1,500/)).toBeTruthy()

  // Clicking "Record Payment" calls onRecordPayment with the record
  fireEvent.click(screen.getByRole('button', { name: /Record Payment/i }))
  expect(recordPayment).toHaveBeenCalledWith(existingJob, 'customer')

  // Saving should NOT send advance in the payload
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(save).toHaveBeenCalledWith({ customer_name: 'Alpha Prints' })
})
