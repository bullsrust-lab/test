import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import useDocumentTitle from '../hooks/useDocumentTitle'
import styles from './NotFound.module.css'

// inside the dashboard it renders in the layout (sidebar stays), outside it's a full page
function NotFound({ inDashboard }) {
  useDocumentTitle('Page not found')

  const body = (
    <div className={styles.body}>
      <p className={`mono ${styles.code}`}>404</p>
      <h1>Page not found</h1>
      <p className={styles.text}>This page doesn't exist, or it was moved. Probably not your fault.</p>
      <Link to={inDashboard ? '/dashboard/all-jobs' : '/'} className="btn btn-primary">
        {inDashboard ? 'Back to all jobs' : 'Back to home'}
      </Link>
    </div>
  )

  if (inDashboard) return body

  return (
    <main className={styles.page}>
      <Logo />
      {body}
    </main>
  )
}

export default NotFound
