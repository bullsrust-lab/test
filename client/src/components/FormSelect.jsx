import { capitalize } from '../utils/constants'
import styles from './Form.module.css'

// options can be plain strings or { value, label }
function FormSelect({ label, name, options, ...selectProps }) {
  return (
    <div className={styles.row}>
      <label htmlFor={name} className={styles.label}>
        {label}
      </label>
      <select id={name} name={name} className={`${styles.input} ${styles.select}`} {...selectProps}>
        {options.map((option) => {
          const value = option.value ?? option
          return (
            <option key={value} value={value}>
              {option.label ?? capitalize(option)}
            </option>
          )
        })}
      </select>
    </div>
  )
}

export default FormSelect
