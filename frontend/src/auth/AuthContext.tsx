import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, invalidateApiSession, TOKEN_KEY } from '../api/client'
import type { AuthPayload } from '../types'

interface AuthContextValue {
  auth: AuthPayload | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  can: (module: string) => boolean
  canShowPayments: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const generation = useRef(0)
  const identity = useRef('')
  const [sessionVersion, setSessionVersion] = useState(0)
  const [auth, setAuth] = useState<AuthPayload | null>(null)
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)))

  const resetPrivateData = useCallback(() => {
    generation.current += 1
    invalidateApiSession()
    void queryClient.cancelQueries()
    queryClient.clear()
    setSessionVersion((version) => version + 1)
  }, [queryClient])

  const clear = useCallback(() => {
    resetPrivateData()
    identity.current = ''
    localStorage.removeItem(TOKEN_KEY)
    setAuth(null)
    setLoading(false)
  }, [resetPrivateData])

  const acceptAuth = useCallback((data: AuthPayload) => {
    const nextIdentity = JSON.stringify([data.user, Object.entries(data.permissions).sort()])
    if (identity.current !== nextIdentity) resetPrivateData()
    identity.current = nextIdentity
    setAuth(data)
  }, [resetPrivateData])

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return
    const started = generation.current
    try {
      const { data } = await api.get<AuthPayload>('/auth/me/')
      if (generation.current === started && localStorage.getItem(TOKEN_KEY) === token) acceptAuth(data)
    } catch {
      // The HTTP client handles 401. A temporary network failure is not a logout.
    }
  }, [acceptAuth])

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return
    refresh().finally(() => setLoading(false))
  }, [refresh])

  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') refresh() }
    const interval = window.setInterval(onFocus, 60_000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh])

  useEffect(() => {
    window.addEventListener('libin:unauthorized', clear)
    return () => window.removeEventListener('libin:unauthorized', clear)
  }, [clear])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== TOKEN_KEY && event.key !== null) return
      resetPrivateData()
      identity.current = ''
      setAuth(null)
      const hasToken = Boolean(localStorage.getItem(TOKEN_KEY))
      setLoading(hasToken)
      if (hasToken) void refresh().finally(() => setLoading(false))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [resetPrivateData, refresh])

  const login = async (username: string, password: string) => {
    clear()
    const started = generation.current
    const { data } = await api.post<AuthPayload>('/auth/login/', { username, password })
    if (generation.current !== started) return
    if (!data.token) throw new Error('The server did not return an authentication token.')
    localStorage.setItem(TOKEN_KEY, data.token)
    acceptAuth(data)
  }

  const logout = async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    clear()
    try {
      if (token) await api.post('/auth/logout/', undefined, { headers: { Authorization: `Token ${token}` } })
    } catch {
      // Local private data is already cleared, including while offline.
    }
  }

  const value = useMemo<AuthContextValue>(() => ({
    auth,
    loading,
    login,
    logout,
    refresh,
    can: (module) => Boolean(auth?.user.is_superuser || auth?.permissions[module]),
    canShowPayments: Boolean(auth?.user.is_superuser || (auth?.user.show_payment_details ?? true)),
  }), [auth, loading, refresh])

  return <AuthContext.Provider value={value}><Fragment key={sessionVersion}>{children}</Fragment></AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

export function useOptionalAuth() {
  return useContext(AuthContext)
}
