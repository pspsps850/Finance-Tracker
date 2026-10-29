import { errorMessage } from '../lib/errors.js'
import { Button } from './Button.jsx'
import { Icon } from './Icon.jsx'

export function ErrorState({ error, onRetry, compact = false }) {
  return (
    <div className={`error-state ${compact ? 'error-state--compact' : ''}`} role="alert">
      <span className="error-state__icon" aria-hidden="true">
        <Icon name="alert" size={20} />
      </span>
      <div>
        <p className="error-state__title">That did not load.</p>
        <p className="error-state__body">{errorMessage(error)}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}
