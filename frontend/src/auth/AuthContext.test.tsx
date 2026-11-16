import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { api, TOKEN_KEY } from '../api/client'
import type { AuthPayload } from '../types'

vi.mock('../api/client', () => ({
  TOKEN_KEY: 'test-auth-token', invalidateApiSession: vi.fn(),
  api: { get: vi.fn(), post: vi.fn() },
}))

const payload = (id: number, allowed = true): AuthPayload => ({
  token: `token-${id}`, permissions: { injobs: allowed },
  user: { id, username: `user-${id}`, first_name: '', last_name: '', email: '', is_superuser: false,
    role: 1, role_name: 'Worker', department: null, department_name: null },
})

function Probe() {
  const { auth, can, login, logout, refresh } = useAuth()
  const privateData = useQuery({ queryKey: ['private-job'], enabled: Boolean(auth) && can('injobs'),
    queryFn: async () => (await api.get('/private-job/')).data as string })
  return <>
    <span>{auth?.user.username || 'signed out'}</span>
    {auth && can('injobs') && <span>{privateData.data}</span>}
    <button onClick={() => void logout()}>logout</button>
    <button onClick={() => void login('user-2', 'test')}>login B</button>
    <button onClick={() => void refresh()}>refresh</button>
  </>
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>)
  return client
}

beforeEach(() => {
  localStorage.setItem(TOKEN_KEY, 'token-1')
  vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/auth/me/' ? payload(1) : 'private A' }))
  vi.mocked(api.post).mockImplementation(async (url) => ({ data: url === '/auth/login/' ? payload(2) : {} }))
})
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks() })

describe('private session data', () => {
  it('clears cached data before another user logs in, even if their fetch fails', async () => {
    const client = mount()
    await screen.findByText('private A')
    fireEvent.click(screen.getByText('logout'))
    await screen.findByText('signed out')
    expect(client.getQueryData(['private-job'])).toBeUndefined()
    vi.mocked(api.get).mockRejectedValue(new Error('offline'))
    fireEvent.click(screen.getByText('login B'))
    await screen.findByText('user-2')
    expect(screen.queryByText('private A')).toBeNull()
    expect(client.getQueryData(['private-job'])).toBeUndefined()
  })

  it('ignores a delayed authentication refresh after logout', async () => {
    mount()
    await screen.findByText('private A')
    let resolve!: (value: { data: AuthPayload }) => void
    vi.mocked(api.get).mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    fireEvent.click(screen.getByText('refresh'))
    fireEvent.click(screen.getByText('logout'))
    await screen.findByText('signed out')
    await act(async () => { resolve({ data: payload(1) }) })
    expect(screen.queryByText('user-1')).toBeNull()
    expect(screen.queryByText('private A')).toBeNull()
  })

  it('clears private queries and rendered details when permission is revoked', async () => {
    const client = mount()
    await screen.findByText('private A')
    vi.mocked(api.get).mockResolvedValueOnce({ data: payload(1, false) })
    fireEvent.click(screen.getByText('refresh'))
    await waitFor(() => expect(screen.queryByText('private A')).toBeNull())
    expect(client.getQueryData(['private-job'])).toBeUndefined()
  })

  it('does not log out on a transient refresh failure', async () => {
    mount()
    await screen.findByText('private A')
    vi.mocked(api.get).mockRejectedValueOnce(new Error('offline'))
    await act(async () => { fireEvent.click(screen.getByText('refresh')) })
    expect(screen.getByText('user-1')).toBeTruthy()
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-1')
  })

  it('clears private data when another tab signs out', async () => {
    const client = mount()
    await screen.findByText('private A')
    act(() => {
      localStorage.removeItem(TOKEN_KEY)
      window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_KEY, newValue: null }))
    })
    await screen.findByText('signed out')
    expect(screen.queryByText('private A')).toBeNull()
    expect(client.getQueryData(['private-job'])).toBeUndefined()
  })
})
