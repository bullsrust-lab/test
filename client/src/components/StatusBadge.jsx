import styles from './StatusBadge.module.css'

function StatusBadge({ status }) {
  return <span className={`${styles.badge} ${styles[status]}`}>{status}</span>
}

export default StatusBadge
