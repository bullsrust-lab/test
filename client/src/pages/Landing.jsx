import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import StatusBadge from '../components/StatusBadge'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import useDocumentTitle from '../hooks/useDocumentTitle'
import styles from './Landing.module.css'

const sample = [
  { position: 'Junior Frontend Developer', company: 'Aviva', status: 'interview', date: 'Sep 29' },
  { position: 'IT Support Analyst', company: 'Norfolk County Council', status: 'pending', date: 'Sep 27' },
  { position: 'React Developer', company: 'Brightside', status: 'pending', date: 'Sep 24' },
  { position: 'Web Developer (Remote)', company: 'Halo Studio', status: 'pending', date: 'Aug 30', quiet: '34d, no reply' },
  { position: 'Graduate Software Engineer', company: 'Lotus Cars', status: 'interview', date: 'Sep 12' },
]

const steps = [
  {
    title: 'Add a job when you apply',
    text: 'Position, company, location and type. Ten seconds, and you can come back to edit it.',
  },
  {
    title: 'Move it along',
    text: 'Pending, interview or declined. The status is what you will glance at most, so it is colour coded.',
  },
  {
    title: 'Know when to follow up',
    text: 'After ten days without a reply the job moves into a short list, with a polite check-in email ready to copy. A month of silence gets it stamped "no reply" so you can stop waiting.',
  },
  {
    title: 'Find anything fast',
    text: 'Search by position, filter by status or type, sort by date or name. Filters stay in the URL, so the back button works.',
  },
]

const year = new Date().getFullYear()

function Landing() {
  const { token } = useAuth()
  useDocumentTitle()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Logo />
        <nav className={styles.headerNav}>
          <ThemeToggle className={styles.themeBtn} />
          {token ? (
            <Link to="/dashboard" className="btn btn-ghost btn-sm">
              Dashboard
            </Link>
          ) : (
            <Link to="/register" className="btn btn-ghost btn-sm">
              Log in
            </Link>
          )}
        </nav>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <h1>Keep track of every job you've applied to.</h1>
            <p className={styles.lead}>
              JobTrail is a small tracker for your job search. Log each application, update the status when
              someone replies, and stop digging through your inbox to remember where you applied.
            </p>
            <div className={styles.cta}>
              <Link to={token ? '/dashboard' : '/register'} className="btn btn-primary">
                {token ? 'Open dashboard' : 'Login / Register'}
              </Link>
              {!token && <span className={styles.ctaNote}>Free. There's a demo account on the next page.</span>}
            </div>
          </div>

          <div className={styles.ledger} aria-hidden="true">
            <div className={styles.ledgerHead}>
              <span>Applications</span>
              <span className="mono">5 of 23</span>
            </div>
            <ul>
              {sample.map((job) => (
                <li key={job.position}>
                  <div className={styles.ledgerMain}>
                    <b>{job.position}</b>
                    <span>
                      {job.company}
                      {job.quiet && <em className={`mono ${styles.ledgerQuiet}`}> · {job.quiet}</em>}
                    </span>
                  </div>
                  <StatusBadge status={job.status} />
                  <span className={`mono ${styles.ledgerDate}`}>{job.date}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.how}>
          <h2>How it works</h2>
          <ol>
            {steps.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>JobTrail · MERN test project</span>
        <span className="mono">{year}</span>
      </footer>
    </div>
  )
}

export default Landing
