import { ApiError } from './lib/errors.js'

export const isMock = import.meta.env.DEV && import.meta.env.VITE_MOCK !== '0'

const unauthorizedListeners = new Set()

export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

function notifyUnauthorized() {
  for (const listener of unauthorizedListeners) listener()
}

function buildQuery(params = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

function normalizeError(payload, status) {
  const error = payload?.error ?? {}
  return new ApiError(error.message || `Request failed with status ${status}.`, {
    status,
    code: error.code || 'request_failed',
    fields: error.fields ?? null,
  })
}

async function request(method, path, { body, params, silent401 = false } = {}) {
  const url = `/api${path}${buildQuery(params)}`

  if (isMock) {
    try {
      const { mockRequest } = await import('./mocks.js')
      return await mockRequest(method, url.replace(/^\/api/, ''), body)
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401 && !silent401) notifyUnauthorized()
        throw error
      }
      throw new ApiError(error?.message || 'The demo backend could not complete that request.', {
        status: 500,
        code: 'mock_failure',
      })
    }
  }

  let response
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Cannot reach the server. Check that the API is running.', {
      status: 0,
      code: 'network_error',
    })
  }

  if (response.status === 204) return null

  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const error = normalizeError(payload, response.status)
    if (response.status === 401 && !silent401) notifyUnauthorized()
    throw error
  }

  return payload
}

export const api = {
  register: (body) => request('POST', '/auth/register', { body }),
  login: (body) => request('POST', '/auth/login', { body, silent401: true }),
  verifyOtp: (body) => request('POST', '/auth/verify-otp', { body }),
  resendOtp: (body) => request('POST', '/auth/resend-otp', { body }),
  logout: () => request('POST', '/auth/logout', { silent401: true }),
  me: () => request('GET', '/auth/me', { silent401: true }),

  accounts: {
    list: () => request('GET', '/accounts'),
    create: (body) => request('POST', '/accounts', { body }),
    update: (id, body) => request('PATCH', `/accounts/${id}`, { body }),
    remove: (id) => request('DELETE', `/accounts/${id}`),
  },

  categories: {
    list: () => request('GET', '/categories'),
    create: (body) => request('POST', '/categories', { body }),
    update: (id, body) => request('PATCH', `/categories/${id}`, { body }),
    remove: (id) => request('DELETE', `/categories/${id}`),
  },

  transactions: {
    list: (params) => request('GET', '/transactions', { params }),
    create: (body) => request('POST', '/transactions', { body }),
    update: (id, body) => request('PATCH', `/transactions/${id}`, { body }),
    remove: (id) => request('DELETE', `/transactions/${id}`),
    transfer: (body) => request('POST', '/transfers', { body }),
  },

  budgets: {
    list: (month) => request('GET', '/budgets', { params: { month } }),
    create: (body) => request('POST', '/budgets', { body }),
    update: (id, body) => request('PATCH', `/budgets/${id}`, { body }),
    remove: (id) => request('DELETE', `/budgets/${id}`),
  },

  goals: {
    list: () => request('GET', '/goals'),
    create: (body) => request('POST', '/goals', { body }),
    update: (id, body) => request('PATCH', `/goals/${id}`, { body }),
    remove: (id) => request('DELETE', `/goals/${id}`),
    allocate: (id, body) => request('POST', `/goals/${id}/allocations`, { body }),
  },

  debts: {
    list: () => request('GET', '/debts'),
    create: (body) => request('POST', '/debts', { body }),
    update: (id, body) => request('PATCH', `/debts/${id}`, { body }),
    remove: (id) => request('DELETE', `/debts/${id}`),
  },

  subscriptions: {
    list: () => request('GET', '/subscriptions'),
    create: (body) => request('POST', '/subscriptions', { body }),
    update: (id, body) => request('PATCH', `/subscriptions/${id}`, { body }),
    remove: (id) => request('DELETE', `/subscriptions/${id}`),
  },

  reports: {
    summary: (month) => request('GET', '/reports/summary', { params: { month } }),
    netWorth: (months = 6) => request('GET', '/reports/net-worth', { params: { months } }),
    cashflow: (months = 6) => request('GET', '/reports/cashflow', { params: { months } }),
  },
}

export async function resetDemoData() {
  if (!isMock) return
  const { resetDemo } = await import('./mocks.js')
  resetDemo()
}
