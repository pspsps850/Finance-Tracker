export function Skeleton({ width = '100%', height = 14 }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />
}

export function SkeletonStack({ rows = 4 }) {
  return (
    <div className="skeleton-stack" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} width={index === rows - 1 ? '65%' : '100%'} height={index % 2 ? 12 : 16} />
      ))}
    </div>
  )
}

export function LoadingPage({ label = 'Loading' }) {
  return (
    <div className="loading-page" role="status" aria-live="polite">
      <span className="loading-page__label">{label}</span>
      <SkeletonStack rows={5} />
    </div>
  )
}

export function SplashScreen() {
  return (
    <div className="splash" role="status" aria-live="polite">
      <span className="splash__mark">FT</span>
      <p>Opening the ledger…</p>
    </div>
  )
}
