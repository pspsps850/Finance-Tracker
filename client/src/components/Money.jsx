import { formatMoney } from '../lib/money.js'

export function Money({ value, signed = false, compact = false, className = '' }) {
  const numeric = Number(value) || 0
  const tone = numeric < 0 ? 'money--debit' : numeric > 0 && signed ? 'money--credit' : ''
  return (
    <span className={`money ${tone} ${className}`.trim()} title={formatMoney(numeric)}>
      {formatMoney(numeric, { signed, compact })}
    </span>
  )
}
