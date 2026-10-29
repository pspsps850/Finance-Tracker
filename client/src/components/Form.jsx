export function Field({ label, htmlFor, error, hint, children, className = '' }) {
  return (
    <div className={`field ${className}`.trim()}>
      {label ? (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {hint && !error ? <p className="field__hint">{hint}</p> : null}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function Input({ className = '', ...rest }) {
  return <input className={`input ${className}`.trim()} {...rest} />
}

export function Select({ options = [], placeholder, className = '', ...rest }) {
  return (
    <select className={`input select ${className}`.trim()} {...rest}>
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function Textarea({ className = '', rows = 3, ...rest }) {
  return <textarea className={`input textarea ${className}`.trim()} rows={rows} {...rest} />
}

export function MoneyInput({ id, value, onChange, disabled = false, placeholder = '0.00' }) {
  return (
    <div className="money-input">
      <span className="money-input__prefix" aria-hidden="true">
        ₱
      </span>
      <input
        id={id}
        className="input money-input__field"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )
}

export function Segmented({ label, options, value, onChange }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`segmented__item ${value === option.value ? 'is-active' : ''}`.trim()}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function FormError({ children }) {
  if (!children) return null
  return (
    <p className="form-error" role="alert">
      {children}
    </p>
  )
}
