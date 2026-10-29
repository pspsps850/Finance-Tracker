import { Icon } from './Icon.jsx'

export function EmptyState({ icon = 'transactions', title, description, action }) {
  return (
    <div className="empty">
      <span className="empty__icon" aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
      <h3 className="empty__title">{title}</h3>
      {description ? <p className="empty__body">{description}</p> : null}
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  )
}
