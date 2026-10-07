import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { getErrorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import { useToast } from '../context/ToastContext'
import { copyText } from '../utils/clipboard'
import { FOLLOW_UP_AFTER, GHOSTED_AFTER, followUpEmail, quietDays } from '../utils/followUp'
import { getItem, setItem } from '../utils/storage'
import { IconCheck, IconChevron, IconCopy } from './Icons'
import styles from './FollowUps.module.css'

const VISIBLE = 3

// Applications nobody answered for a while, with a ready-to-send check-in email.
// It's a helper on top of the list, so if it fails to load it just doesn't show up.
function FollowUps({ reloadKey, onChange }) {
  const [data, setData] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [collapsed, setCollapsed] = useState(() => getItem('followUpsCollapsed') === '1')
  const [busyId, setBusyId] = useState(null)
  const { user, isDemo } = useAuth()
  const { canWrite } = useOrg()
  const toast = useToast()

  useEffect(() => {
    const controller = new AbortController()
    api
      .get('/jobs/follow-ups', { signal: controller.signal })
      .then(({ data }) => setData(data))
      .catch(() => {
        if (!controller.signal.aborted) setData(null)
      })
    return () => controller.abort()
  }, [reloadKey])

  if (!data || (data.dueCount === 0 && data.ghostedCount === 0)) return null

  const toggle = () => {
    setItem('followUpsCollapsed', collapsed ? '0' : '1')
    setCollapsed(!collapsed)
  }

  const copyEmail = async (job) => {
    const ok = await copyText(followUpEmail(job, user?.name))
    if (ok) toast.success('Follow-up email copied')
    else toast.error("Couldn't copy, your browser blocked the clipboard")
  }

  const markDone = async (job) => {
    setBusyId(job._id)
    try {
      await api.post(`/jobs/${job._id}/follow-up`)
      setData((d) => ({ ...d, jobs: d.jobs.filter((j) => j._id !== job._id), dueCount: d.dueCount - 1 }))
      toast.success(`Noted. It'll come back here if they stay quiet for another ${FOLLOW_UP_AFTER} days.`)
      onChange?.()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  const jobs = showAll ? data.jobs : data.jobs.slice(0, VISIBLE)

  return (
    <section className={styles.panel} aria-labelledby="followups-title">
      <header className={styles.head}>
        <div>
          <h2 id="followups-title" className={styles.title}>
            Gone quiet
            {data.dueCount > 0 && <span className={`mono ${styles.count}`}>{data.dueCount}</span>}
          </h2>
          {!collapsed && (
            <p className={styles.lead}>
              No reply for {FOLLOW_UP_AFTER}+ days. A short check-in is worth sending, it often gets an answer.
            </p>
          )}
        </div>
        <button
          type="button"
          className={styles.toggle}
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="followups-body"
        >
          {collapsed ? 'Show' : 'Hide'}
          <IconChevron size={14} style={{ transform: `rotate(${collapsed ? 90 : -90}deg)` }} />
        </button>
      </header>

      {!collapsed && (
        <div id="followups-body">
          {jobs.length > 0 && (
            <ul className={styles.list}>
              {jobs.map((job) => (
                <li key={job._id} className={styles.row}>
                  <div className={styles.initial} aria-hidden="true">
                    {job.company.charAt(0)}
                  </div>
                  <div className={styles.info}>
                    <b>{job.position}</b>
                    <span>
                      {job.company} ·{' '}
                      <span className="mono">
                        {job.status === 'interview' ? 'no news for' : 'no reply for'} {quietDays(job)}d
                      </span>
                    </span>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => copyEmail(job)}
                      aria-label={`Copy follow-up email for ${job.position} at ${job.company}`}
                    >
                      <IconCopy size={15} />
                      Copy email
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => markDone(job)}
                      disabled={!canWrite || busyId === job._id}
                      title={isDemo ? 'Read-only in the demo' : !canWrite ? 'Viewers are read-only' : undefined}
                      aria-label={`Mark ${job.position} at ${job.company} as followed up`}
                    >
                      <IconCheck size={15} />
                      Followed up
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {data.jobs.length > VISIBLE && (
            <button type="button" className={styles.more} onClick={() => setShowAll(!showAll)}>
              {showAll
                ? 'Show fewer'
                : data.dueCount > data.jobs.length
                  ? `Show the ${data.jobs.length} quietest of ${data.dueCount}`
                  : `Show all ${data.jobs.length}`}
            </button>
          )}

          {data.ghostedCount > 0 && (
            <p className={styles.foot}>
              {data.ghostedCount} more {data.ghostedCount === 1 ? 'has' : 'have'} had no reply for over{' '}
              {GHOSTED_AFTER} days. <Link to="/dashboard/all-jobs?status=pending&sort=oldest">See them</Link>
            </p>
          )}
        </div>
      )}
    </section>
  )
}

export default FollowUps
