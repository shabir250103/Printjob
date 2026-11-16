import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, expect, it, vi } from 'vitest'
import { api, invalidateApiSession, TOKEN_KEY } from './client'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); invalidateApiSession() })

it('rejects a delayed success from an older session', async () => {
  let finish!: (response: AxiosResponse) => void
  let request!: InternalAxiosRequestConfig
  const result = api.get('/private/', { adapter: (config) => {
    request = config
    return new Promise((resolve) => { finish = resolve })
  } })
  const assertion = expect(result).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  invalidateApiSession()
  finish({ data: 'old private details', status: 200, statusText: 'OK', headers: new AxiosHeaders(), config: request })
  await assertion
})

it('an old 401 cannot remove the new session token', async () => {
  let fail!: (reason: Error) => void
  let request!: InternalAxiosRequestConfig
  localStorage.setItem(TOKEN_KEY, 'old-token')
  const dispatch = vi.spyOn(window, 'dispatchEvent')
  const result = api.get('/private/', { adapter: (config) => {
    request = config
    return new Promise((_resolve, reject) => { fail = reject })
  } })
  const assertion = expect(result).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  await vi.waitFor(() => expect(fail).toBeTypeOf('function'))
  invalidateApiSession()
  localStorage.setItem(TOKEN_KEY, 'new-token')
  fail(new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', request, undefined, {
    status: 401, statusText: 'Unauthorized', data: {}, headers: new AxiosHeaders(), config: request,
  }))
  await assertion
  expect(localStorage.getItem(TOKEN_KEY)).toBe('new-token')
  expect(dispatch).not.toHaveBeenCalled()
})
