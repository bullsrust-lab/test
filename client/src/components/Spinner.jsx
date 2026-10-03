import styles from './Spinner.module.css'

function Spinner({ full }) {
  return (
    <div className={full ? styles.full : styles.inline} role="status">
      <span className={styles.spinner} />
      <span className="visually-hidden">Loading…</span>
    </div>
  )
}

export default Spinner
