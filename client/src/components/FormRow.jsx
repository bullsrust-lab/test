import styles from './Form.module.css'

function FormRow({ label, name, error, hint, type = 'text', children, ...inputProps }) {
  const errorId = `${name}-error`
  const hintId = `${name}-hint`
  const describedBy = [error && errorId, hint && !error && hintId].filter(Boolean).join(' ') || undefined

  return (
    <div className={styles.row}>
      <label htmlFor={name} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        <input
          id={name}
          name={name}
          type={type}
          className={`${styles.input} ${error ? styles.invalid : ''}`}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...inputProps}
        />
        {children}
      </div>
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className={styles.hint}>
            {hint}
          </p>
        )
      )}
    </div>
  )
}

export default FormRow
