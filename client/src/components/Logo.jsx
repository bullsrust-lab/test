import { Link } from 'react-router-dom'
import styles from './Logo.module.css'

function Logo({ to = '/' }) {
  return (
    <Link to={to} className={styles.logo} aria-label="JobTrail home">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="var(--accent)" />
        <path d="M9 21.5c2.2 0 3.5-1.3 3.5-3.6V10h3v8c0 4-2.5 6.4-6.5 6.4zM18 22h5v2.5h-5z" fill="var(--on-accent)" />
        <circle cx="21" cy="12" r="2.4" fill="var(--on-accent)" />
      </svg>
      <span>
        Job<b>Trail</b>
      </span>
    </Link>
  )
}

export default Logo
