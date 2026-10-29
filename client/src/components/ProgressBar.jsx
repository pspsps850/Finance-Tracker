export function ProgressBar({ value, tone = 'credit', label }) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
  return (
    <div
      className={`progress progress--${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
    >
      <span className="progress__fill" style={{ width: `${percent}%` }} />
    </div>
  )
}
