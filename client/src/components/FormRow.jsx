import styles from './Form.module.css'

function FormRow({ label, name, error, type = 'text', children, ...inputProps }) {
  const errorId = error ? `${name}-error` : undefined

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
          aria-describedby={errorId}
          {...inputProps}
        />
        {children}
      </div>
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  )
}

export default FormRow
