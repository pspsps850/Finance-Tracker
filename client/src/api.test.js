import { beforeEach, describe, expect, it } from 'vitest'
import { api } from './api.js'
import { resetDemoData } from './api.js'
import { DEMO_EMAIL, DEMO_PASSWORD } from './lib/demo.js'
import { ApiError } from './lib/errors.js'

describe('api client', () => {
  beforeEach(async () => {
    await resetDemoData()
  })

  it('throws a typed 401 when no session exists', async () => {
    await expect(api.accounts.list()).rejects.toBeInstanceOf(ApiError)
    await expect(api.accounts.list()).rejects.toMatchObject({ status: 401, code: 'unauthorized' })
  })

  it('signs in and loads accounts through the same interface as the real API', async () => {
    const { user } = await api.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
    expect(user.email).toBe(DEMO_EMAIL)

    const accounts = await api.accounts.list()
    expect(Array.isArray(accounts)).toBe(true)
    expect(accounts.length).toBeGreaterThan(0)

    const budgets = await api.budgets.list()
    expect(Array.isArray(budgets)).toBe(true)
  })

  it('serializes query parameters for filtered lists', async () => {
    await api.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
    const page = await api.transactions.list({ page: 1, page_size: 3, q: 'rent' })
    expect(page.page_size).toBe(3)
    expect(page.items.length).toBeLessThanOrEqual(3)
  })

  it('validates credentials and keeps the field-level error shape', async () => {
    await expect(
      api.register({ email: DEMO_EMAIL, password: 'short', display_name: 'Ana' }),
    ).rejects.toMatchObject({
      status: 400,
      fields: { password: expect.any(String) },
    })
  })
})
