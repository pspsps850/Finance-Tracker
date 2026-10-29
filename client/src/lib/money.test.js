import { describe, expect, it } from 'vitest'
import { centsToInput, formatMoney, parseMoney, percentOf } from './money.js'

describe('formatMoney', () => {
  it('formats cents as pesos with two decimals and grouping', () => {
    expect(formatMoney(123456)).toBe('₱1,234.56')
    expect(formatMoney(0)).toBe('₱0.00')
    expect(formatMoney(5)).toBe('₱0.05')
  })

  it('shows negatives with a leading minus', () => {
    expect(formatMoney(-123456)).toBe('-₱1,234.56')
  })

  it('adds a plus sign only when signed is requested', () => {
    expect(formatMoney(2900000, { signed: true })).toBe('+₱29,000.00')
    expect(formatMoney(2900000)).toBe('₱29,000.00')
    expect(formatMoney(-500, { signed: true })).toBe('-₱5.00')
  })

  it('compacts large values for chart axes', () => {
    expect(formatMoney(150000000, { compact: true })).toBe('₱1.5m')
    expect(formatMoney(12500000, { compact: true })).toBe('₱125k')
  })

  it('survives missing values', () => {
    expect(formatMoney(undefined)).toBe('₱0.00')
    expect(formatMoney(null)).toBe('₱0.00')
  })
})

describe('parseMoney', () => {
  it('parses plain and formatted input into cents', () => {
    expect(parseMoney('1234.56')).toBe(123456)
    expect(parseMoney('1,234.5')).toBe(123450)
    expect(parseMoney('₱ 1,234.56')).toBe(123456)
    expect(parseMoney('0')).toBe(0)
    expect(parseMoney('-500')).toBe(-50000)
  })

  it('rejects empty, malformed, and over-precise input', () => {
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('   ')).toBeNull()
    expect(parseMoney('12.345')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('1.2.3')).toBeNull()
  })
})

describe('centsToInput', () => {
  it('renders cents as an editable decimal string', () => {
    expect(centsToInput(123456)).toBe('1234.56')
    expect(centsToInput(0)).toBe('0.00')
    expect(centsToInput(null)).toBe('0.00')
  })
})

describe('percentOf', () => {
  it('rounds the ratio and guards against a zero whole', () => {
    expect(percentOf(25, 100)).toBe(25)
    expect(percentOf(1, 3)).toBe(33)
    expect(percentOf(10, 0)).toBe(0)
  })
})
