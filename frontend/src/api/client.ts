import axios, { CanceledError, type InternalAxiosRequestConfig } from 'axios'

export const TOKEN_KEY = 'libin_auth_token'
let sessionEpoch = 0
type SessionRequest = InternalAxiosRequestConfig & { sessionEpoch?: number }

export function invalidateApiSession() {
  sessionEpoch += 1
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const request = config as SessionRequest
  request.sessionEpoch = sessionEpoch
  const token = localStorage.getItem(TOKEN_KEY)
  if (token && !config.headers.Authorization) config.headers.Authorization = `Token ${token}`
  return config
})

api.interceptors.response.use(
  (response) => {
    if ((response.config as SessionRequest).sessionEpoch !== sessionEpoch) throw new CanceledError('Session changed')
    return response
  },
  (error) => {
    if (error.config && (error.config as SessionRequest).sessionEpoch !== sessionEpoch) return Promise.reject(new CanceledError('Session changed'))
    if (error.response?.status === 401 && !String(error.config?.url).includes('/auth/login/')) {
      localStorage.removeItem(TOKEN_KEY)
      window.dispatchEvent(new Event('libin:unauthorized'))
    }
    return Promise.reject(error)
  },
)

export function apiError(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Something went wrong. Please try again.'
  const data = error.response?.data
  if (typeof data === 'string') return data
  if (data?.detail) return Array.isArray(data.detail) ? data.detail.join(', ') : data.detail
  if (data && typeof data === 'object') {
    return Object.entries(data)
      .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
      .join(' · ')
  }
  return error.message || 'Unable to contact the server.'
}
