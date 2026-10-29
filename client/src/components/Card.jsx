export function Card({ children, className = '', as: Tag = 'section', ...rest }) {
  return (
    <Tag className={`card ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  )
}

export function CardHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="card__head">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        {title ? <h2 className="card__title">{title}</h2> : null}
        {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="card__actions">{actions}</div> : null}
    </div>
  )
}
