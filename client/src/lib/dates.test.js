import { describe, expect, it } from 'vitest'
import {
  addDays,
  dateKeyInTz,
  daysUntil,
  formatDate,
  fromManilaDatetimeInput,
  lastNMonths,
  monthRange,
  shiftMonth,
  toManilaDatetimeInput,
} from './dates.js'

describe('dateKeyInTz', () => {
  it('rolls the date forward across the Manila midnight boundary', () => {
    expect(dateKeyInTz(new Date('2026-01-01T15:59:00Z'))).toBe('2026-01-01')
    expect(dateKeyInTz(new Date('2026-01-01T16:30:00Z'))).toBe('2026-01-02')
  })
})

describe('monthRange', () => {
  it('handles a leap February', () => {
    expect(monthRange('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' })
  })

  it('handles a 31-day month', () => {
    expect(monthRange('2026-10')).toEqual({ start: '2026-10-01', end: '2026-10-31' })
  })
})

describe('shiftMonth / lastNMonths', () => {
  it('crosses year boundaries in both directions', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('returns an inclusive ordered window', () => {
    expect(lastNMonths(3, '2026-01')).toEqual(['2025-11', '2025-12', '2026-01'])
  })
})

describe('formatDate', () => {
  it('formats date-only keys without a timezone shift', () => {
    expect(formatDate('2026-10-29')).toBe('29 Oct 2026')
    expect(formatDate('2026-10-29', { withYear: false })).toBe('29 Oct')
    expect(formatDate(null)).toBe('—')
  })
})

describe('datetime-local helpers', () => {
  it('converts to and from a Manila wall-clock value', () => {
    expect(toManilaDatetimeInput(new Date('2026-10-29T16:30:00Z'))).toBe('2026-10-30T00:30')
    expect(fromManilaDatetimeInput('2026-10-30T00:30')).toBe('2026-10-30T00:30:00+08:00')
  })
})

describe('day math', () => {
  it('adds days across a leap day', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })

  it('counts whole days between keys', () => {
    expect(daysUntil('2026-11-01', '2026-10-29')).toBe(3)
    expect(daysUntil('2026-10-28', '2026-10-29')).toBe(-1)
  })
})
