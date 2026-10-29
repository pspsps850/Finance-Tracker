import { beforeEach, describe, expect, it } from 'vitest'
import { mockRequest, resetDemo } from './mocks.js'
import { DEMO_EMAIL, DEMO_OTP, DEMO_PASSWORD } from './lib/demo.js'
import { ApiError } from './lib/errors.js'

async function login(email = DEMO_EMAIL, password = DEMO_PASSWORD) {
  return mockRequest('POST', '/auth/login', { email, password })
}

describe('demo backend', () => {
  beforeEach(() => {
    resetDemo()
  })

  it('signs the demo user in and returns a scoped session', async () => {
    const { user } = await login()
    expect(user.email).toBe(DEMO_EMAIL)
    expect(user).not.toHaveProperty('password')
    expect(user).not.toHaveProperty('otp_hash')

    const session = await mockRequest('GET', '/auth/me')
    expect(session.user.email).toBe(DEMO_EMAIL)
  })

  it('rejects a wrong password with a 401', async () => {
    await expect(login(DEMO_EMAIL, 'wrong-password')).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credentials',
    })
  })

  it('requires a session for ledger routes', async () => {
    await expect(mockRequest('GET', '/accounts')).rejects.toBeInstanceOf(ApiError)
    await expect(mockRequest('GET', '/accounts')).rejects.toMatchObject({ status: 401 })
  })

  it('registers, verifies the OTP, and starts a session', async () => {
    const email = 'new@example.test'
    const registered = await mockRequest('POST', '/auth/register', {
      email,
      password: 'password123',
      display_name: 'New Saver',
    })
    expect(registered).toEqual({ status: 'otp_required', email })

    await expect(
      mockRequest('POST', '/auth/verify-otp', { email, code: '000000' }),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_code' })

    const { user } = await mockRequest('POST', '/auth/verify-otp', { email, code: DEMO_OTP })
    expect(user.display_name).toBe('New Saver')

    const session = await mockRequest('GET', '/auth/me')
    expect(session.user.email).toBe(email)
  })

  it('computes balances and exposes paginated transactions', async () => {
    await login()
    const accounts = await mockRequest('GET', '/accounts')
    expect(accounts.length).toBeGreaterThan(0)
    expect(accounts.every((account) => Number.isInteger(account.balance_cents))).toBe(true)

    const page = await mockRequest('GET', '/transactions?page=1&page_size=5')
    expect(page.items).toHaveLength(5)
    expect(page.total).toBeGreaterThan(5)
    expect(page.items[0]).toHaveProperty('account_name')
  })

  it('creates two linked legs for a transfer and keeps them out of spend', async () => {
    await login()
    const before = await mockRequest('GET', '/transactions?page=1&page_size=100')
    const summaryBefore = await mockRequest('GET', '/reports/summary')
    const accounts = await mockRequest('GET', '/accounts')
    const from = accounts.find((account) => account.type === 'asset')
    const to = accounts.find((account) => account.type === 'asset' && account.id !== from.id)

    const transfer = await mockRequest('POST', '/transfers', {
      from_account_id: from.id,
      to_account_id: to.id,
      amount_cents: 10000,
      occurred_at: `${new Date().toISOString().slice(0, 10)}T10:00:00+08:00`,
    })
    expect(transfer.legs).toHaveLength(2)
    expect(transfer.legs[0].amount_cents + transfer.legs[1].amount_cents).toBe(0)

    const after = await mockRequest('GET', '/transactions?page=1&page_size=100')
    expect(after.total).toBe(before.total + 2)

    const summaryAfter = await mockRequest('GET', '/reports/summary')
    expect(summaryAfter.month_expense_cents).toBe(summaryBefore.month_expense_cents)
  })
})
