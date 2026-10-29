import { Link } from 'react-router-dom'
import { AuthShell } from '../components/AuthShell.jsx'

export function NotFound() {
  return (
    <AuthShell
      eyebrow="404"
      title="This page is not in the ledger"
      description="The address does not match anything here — it may have been moved or never existed."
    >
      <Link className="btn btn--primary btn--md btn--block" to="/">
        Back to the dashboard
      </Link>
    </AuthShell>
  )
}
