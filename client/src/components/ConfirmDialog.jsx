import { Button } from './Button.jsx'
import { Modal } from './Modal.jsx'

export function ConfirmDialog({
  open,
  title = 'Delete this record?',
  body,
  confirmLabel = 'Delete',
  cancelLabel = 'Keep it',
  tone = 'danger',
  busy = false,
  onConfirm,
  onClose,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="confirm-copy">{body}</p>
    </Modal>
  )
}
