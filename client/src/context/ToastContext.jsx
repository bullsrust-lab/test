import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { IconCheck, IconAlert, IconClose } from '../components/Icons'
import styles from './Toast.module.css'

const ToastContext = createContext(null)

// errors stay longer, you usually need to read them
const DURATION = { success: 3500, error: 7000 }

function Toast({ toast, onDismiss }) {
  const remaining = useRef(DURATION[toast.type])
  const startedAt = useRef(0)
  const timer = useRef()

  const resume = useCallback(() => {
    startedAt.current = Date.now()
    timer.current = setTimeout(() => onDismiss(toast.id), remaining.current)
  }, [onDismiss, toast.id])

  const pause = () => {
    clearTimeout(timer.current)
    remaining.current -= Date.now() - startedAt.current
  }

  useEffect(() => {
    resume()
    return () => clearTimeout(timer.current)
  }, [resume])

  return (
    <div
      className={`${styles.toast} ${styles[toast.type]}`}
      role={toast.type === 'error' ? 'alert' : undefined}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      {toast.type === 'error' ? <IconAlert /> : <IconCheck />}
      <span>{toast.text}</span>
      <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        <IconClose size={14} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((text, type) => {
    const id = ++nextId.current
    setToasts((list) => [...list.slice(-2), { id, text, type }])
  }, [])

  const toast = useMemo(
    () => ({ success: (text) => show(text, 'success'), error: (text) => show(text, 'error') }),
    [show]
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={styles.stack} aria-live="polite">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
