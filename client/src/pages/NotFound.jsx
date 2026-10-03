import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import styles from './NotFound.module.css'

function NotFound() {
  return (
    <main className={styles.page}>
      <Logo />
      <div className={styles.body}>
        <p className={`mono ${styles.code}`}>404</p>
        <h1>Page not found</h1>
        <p className={styles.text}>This page doesn't exist, or it was moved. Probably not your fault.</p>
        <Link to="/" className="btn btn-primary">
          Back to home
        </Link>
      </div>
    </main>
  )
}

export default NotFound
