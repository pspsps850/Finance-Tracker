const PESO = '₱'

export function formatMoney(cents, { signed = false, compact = false } = {}) {
  const value = Number(cents) || 0
  const abs = Math.abs(value) / 100

  if (compact && abs >= 1000) {
    const units = [
      { limit: 1_000_000_000, suffix: 'b' },
      { limit: 1_000_000, suffix: 'm' },
      { limit: 1_000, suffix: 'k' },
    ]
    const unit = units.find((u) => abs >= u.limit)
    const scaled = abs / unit.limit
    const digits = scaled >= 100 ? 0 : 1
    return `${PESO}${scaled.toFixed(digits).replace(/\.0$/, '')}${unit.suffix}`
  }

  const body = abs.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const sign = value < 0 ? '-' : signed && value > 0 ? '+' : ''
  return `${sign}${PESO}${body}`
}

export function parseMoney(input) {
  if (input === null || input === undefined) return null
  const raw = String(input).trim().replace(/[\s,₱]/g, '')
  if (!raw) return null
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) return null

  const negative = raw.startsWith('-')
  const [whole, fraction = ''] = raw.replace('-', '').split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return negative ? -cents : cents
}

export function centsToInput(cents) {
  return ((Number(cents) || 0) / 100).toFixed(2)
}

export function formatPercent(value, digits = 0) {
  const n = Number(value) || 0
  return `${n.toFixed(digits)}%`
}

export function percentOf(part, whole) {
  if (!whole) return 0
  return Math.round((Number(part) / Number(whole)) * 100)
}
