import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import StatusBadge from './StatusBadge'
import { capitalize } from '../utils/constants'
import { followUpState } from '../utils/followUp'
import { IconBriefcase, IconCalendar, IconClock, IconEdit, IconPin, IconTrash, IconUser } from './Icons'
import styles from './JobCard.module.css'

function JobCard({ job, onDelete, readOnly, editSearch, showAuthor }) {
  const { _id, position, company, jobLocation, jobType, status, createdAt } = job
  const quiet = followUpState(job)
  const label = (
    <span className="visually-hidden">
      {' '}
      {position} at {company}
    </span>
  )

  return (
    <article className={styles.card} data-quiet={quiet?.level}>
      <header className={styles.head}>
        <div className={styles.initial} aria-hidden="true">
          {company.charAt(0)}
        </div>
        <div className={styles.titles}>
          <h2 className={styles.position}>{position}</h2>
          <p className={styles.company}>{company}</p>
        </div>
        <StatusBadge status={status} />
      </header>

      <ul className={styles.meta}>
        <li>
          <IconPin size={15} />
          {jobLocation}
        </li>
        <li>
          <IconBriefcase size={15} />
          {capitalize(jobType)}
        </li>
        <li>
          <IconCalendar size={15} />
          <time className="mono" dateTime={createdAt}>
            {dayjs(createdAt).format('MMM D, YYYY')}
          </time>
        </li>
        {showAuthor && job.createdByName && (
          <li>
            <IconUser size={15} />
            {job.createdByName}
          </li>
        )}
        {quiet && (
          <li className={styles.quiet}>
            <IconClock size={15} />
            <span className="mono">
              {status === 'interview' ? `No news for ${quiet.days} days` : `${quiet.days} days, no reply`}
            </span>
          </li>
        )}
      </ul>

      <footer className={styles.actions}>
        <Link
          to={`/dashboard/edit-job/${_id}`}
          state={{ from: editSearch }}
          className="btn btn-ghost btn-sm"
          aria-disabled={readOnly}
          onClick={(e) => readOnly && e.preventDefault()}
        >
          <IconEdit size={15} />
          Edit{label}
        </Link>
        <button
          type="button"
          className={`btn btn-sm ${styles.delete}`}
          onClick={() => onDelete(job)}
          disabled={readOnly}
        >
          <IconTrash size={15} />
          Delete{label}
        </button>
        {quiet?.level === 'ghosted' && (
          // decorative, the same information is already in the meta line above
          <span className={styles.stamp} aria-hidden="true">
            No reply
          </span>
        )}
      </footer>
    </article>
  )
}

export default JobCard
