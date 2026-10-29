export const MANILA_TZ = 'Asia/Manila'

function partsInTz(date, timeZone = MANILA_TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const map = {}
  for (const part of parts) map[part.type] = part.value
  return { year: map.year, month: map.month, day: map.day }
}

export function dateKeyInTz(date = new Date(), timeZone = MANILA_TZ) {
  const { year, month, day } = partsInTz(date, timeZone)
  return `${year}-${month}-${day}`
}

export function todayKey() {
  return dateKeyInTz(new Date())
}

export function currentMonthKey() {
  return todayKey().slice(0, 7)
}

export function monthRange(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function shiftMonth(monthKey, delta) {
  const [year, month] = String(monthKey).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function lastNMonths(count, endMonth = currentMonthKey()) {
  const months = []
  for (let i = count - 1; i >= 0; i -= 1) months.push(shiftMonth(endMonth, -i))
  return months
}

function parseDateKey(key) {
  const [year, month, day] = String(key).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function formatDate(key, { withYear = true } = {}) {
  if (!key) return '—'
  const date = parseDateKey(key)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  }).formatToParts(date)
  const map = {}
  for (const part of parts) map[part.type] = part.value
  return withYear ? `${map.day} ${map.month} ${map.year}` : `${map.day} ${map.month}`
}

export function formatMonth(monthKey) {
  if (!monthKey) return '—'
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(parseDateKey(`${monthKey}-01`))
}

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function toManilaDatetimeInput(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return toManilaDatetimeInput(new Date())
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const map = {}
  for (const part of parts) map[part.type] = part.value
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`
}

export function fromManilaDatetimeInput(value) {
  if (!value) return null
  const normalized = value.length === 16 ? `${value}:00` : value
  return `${normalized}+08:00`
}

export function addDays(dateKey, days) {
  const date = parseDateKey(dateKey)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function daysUntil(dateKey, from = todayKey()) {
  if (!dateKey) return null
  const diff = parseDateKey(dateKey).getTime() - parseDateKey(from).getTime()
  return Math.round(diff / 86_400_000)
}

export function relativeDays(dateKey) {
  const diff = daysUntil(dateKey)
  if (diff === null) return ''
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff < 0) return `${Math.abs(diff)} days ago`
  return `In ${diff} days`
}
