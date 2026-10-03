import { IconChevron } from './Icons'
import styles from './Pagination.module.css'

// 1 … 4 5 6 … 12
const getPages = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) pages.push('…')
  for (let p = start; p <= end; p++) pages.push(p)
  if (end < total - 1) pages.push('…')
  pages.push(total)
  return pages
}

function Pagination({ page, numOfPages, onChange }) {
  if (numOfPages <= 1) return null

  return (
    <nav className={styles.pagination} aria-label="Pagination">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <IconChevron dir="left" size={15} />
        Prev
      </button>

      <ol className={styles.pages}>
        {getPages(page, numOfPages).map((p, i) =>
          p === '…' ? (
            <li key={`gap-${i}`} className={styles.gap}>
              …
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                className={`${styles.page} ${p === page ? styles.active : ''}`}
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onChange(p)}
              >
                {p}
              </button>
            </li>
          )
        )}
      </ol>

      <span className={`mono ${styles.counter}`}>
        Page {page} of {numOfPages}
      </span>

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={page >= numOfPages}
        onClick={() => onChange(page + 1)}
      >
        Next
        <IconChevron size={15} />
      </button>
    </nav>
  )
}

export default Pagination
