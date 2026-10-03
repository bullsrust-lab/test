import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import StatusBadge from './StatusBadge'
import { capitalize } from '../utils/constants'
import { IconBriefcase, IconCalendar, IconEdit, IconPin, IconTrash } from './Icons'
import styles from './JobCard.module.css'

function JobCard({ job, onDelete, readOnly, editSearch }) {
  const { _id, position, company, jobLocation, jobType, status, createdAt } = job

  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <div className={styles.initial} aria-hidden="true">
          {company.charAt(0)}
        </div>
        <div className={styles.titles}>
          <h3 className={styles.position}>{position}</h3>
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
          Edit
        </Link>
        <button
          type="button"
          className={`btn btn-sm ${styles.delete}`}
          onClick={() => onDelete(job)}
          disabled={readOnly}
        >
          <IconTrash size={15} />
          Delete
        </button>
      </footer>
    </article>
  )
}

export default JobCard
