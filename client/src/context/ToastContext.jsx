import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { IconCheck, IconAlert, IconClose } from '../components/Icons'
import styles from './Toast.module.css'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (text, type = 'success') => {
      const id = ++nextId.current
      setToasts((list) => [...list.slice(-2), { id, text, type }])
      setTimeout(() => dismiss(id), 3500)
    },
    [dismiss]
  )

  const toast = useMemo(
    () => ({ success: (text) => show(text, 'success'), error: (text) => show(text, 'error') }),
    [show]
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={styles.stack} role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.type]}`}>
            {t.type === 'error' ? <IconAlert /> : <IconCheck />}
            <span>{t.text}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <IconClose size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
