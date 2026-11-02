import { describe, expect, it } from 'vitest'
import {
  hasErrors,
  validateBudget,
  validateOtp,
  validateSubscription,
  validateTransaction,
} from './validation.js'

describe('validateTransaction', () => {
  const base = {
    kind: 'expense',
    account_id: '1',
    category_id: '2',
    amount: '25.00',
    occurred_at: '2026-10-29T10:00',
  }

  it('accepts a complete expense', () => {
    expect(validateTransaction(base)).toEqual({})
  })

  it('rejects a missing account and a zero amount', () => {
    const errors = validateTransaction({ ...base, account_id: '', amount: '0' })
    expect(errors.account_id).toBeTruthy()
    expect(errors.amount).toBeTruthy()
    expect(hasErrors(errors)).toBe(true)
  })

  it('rejects a transfer to the same account', () => {
    const errors = validateTransaction({
      ...base,
      kind: 'transfer',
      category_id: '',
      to_account_id: '1',
    })
    expect(errors.to_account_id).toBeTruthy()
  })

  it('accepts a transfer between different accounts', () => {
    const errors = validateTransaction({
      ...base,
      kind: 'transfer',
      category_id: '',
      to_account_id: '2',
    })
    expect(errors).toEqual({})
  })
})

describe('validateBudget', () => {
  it('requires a category, month, and positive limit', () => {
    expect(validateBudget({ category_id: '', month: '', limit: '0' })).toEqual({
      category_id: 'Choose a category.',
      month: 'Choose the budget month.',
      limit: 'Set a limit greater than zero.',
    })
    expect(validateBudget({ category_id: '3', month: '2026-10', limit: '9000' })).toEqual({})
  })
})

describe('validateSubscription', () => {
  const base = {
    name: 'Streaming',
    amount: '12.99',
    billing_cycle: 'yearly',
    next_due_date: '2026-11-15',
  }

  it('accepts a complete subscription with any billing cycle', () => {
    expect(validateSubscription(base)).toEqual({})
    expect(validateSubscription({ ...base, billing_cycle: 'weekly' })).toEqual({})
  })

  it('requires a billing cycle', () => {
    const errors = validateSubscription({ ...base, billing_cycle: '' })
    expect(errors.billing_cycle).toBe('Choose a billing cycle.')
    expect(hasErrors(errors)).toBe(true)
  })
})

describe('validateOtp', () => {
  it('only accepts six digits', () => {
    expect(validateOtp('123456')).toEqual({})
    expect(validateOtp('12345')).toHaveProperty('code')
    expect(validateOtp('12345a')).toHaveProperty('code')
  })
})
