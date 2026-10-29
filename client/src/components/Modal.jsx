import { useEffect, useRef } from 'react'
import { Icon } from './Icon.jsx'

export function Modal({ open, onClose, title, children, footer, wide = false }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const handleCancel = (event) => {
      event.preventDefault()
      onClose?.()
    }
    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [onClose])

  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal--wide' : ''}`.trim()}
      onClick={(event) => {
        if (event.target === ref.current) onClose?.()
      }}
    >
      <div className="modal__surface">
        <header className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <Icon name="x" />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__foot">{footer}</footer> : null}
      </div>
    </dialog>
  )
}
