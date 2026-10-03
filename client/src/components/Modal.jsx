import { useEffect, useRef } from 'react'
import styles from './Modal.module.css'

// native <dialog> gives focus trapping and Esc handling for free
function Modal({ open, title, children, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="modal-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className={styles.body}>
        <h2 id="modal-title" className={styles.title}>
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  )
}

export default Modal
