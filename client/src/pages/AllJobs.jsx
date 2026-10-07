import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import FollowUps from '../components/FollowUps'
import JobCard from '../components/JobCard'
import JobsFilters from '../components/JobsFilters'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import { IconPlus } from '../components/Icons'
import api, { getErrorMessage } from '../api/client'
import { useOrg } from '../context/OrgContext'
import { useToast } from '../context/ToastContext'
import { PAGE_SIZE } from '../utils/constants'
import styles from './AllJobs.module.css'

const DEFAULTS = { search: '', status: 'all', jobType: 'all', sort: 'latest' }
const EMPTY = { jobs: [], totalJobs: 0, numOfPages: 0 }

function AllJobs() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const countRef = useRef(null)
  const { active, canWrite } = useOrg()
  const toast = useToast()

  const filters = Object.fromEntries(
    Object.entries(DEFAULTS).map(([key, value]) => [key, searchParams.get(key) ?? value])
  )
  // same parsing as the server, so "?page=2abc" means page 2 on both sides
  const page = Math.max(1, Number.parseInt(searchParams.get('page'), 10) || 1)
  const query = searchParams.toString()

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')

    const params = new URLSearchParams(query)
    api
      .get('/jobs', { params: { ...Object.fromEntries(params), limit: PAGE_SIZE }, signal: controller.signal })
      .then(({ data }) => {
        // the page in the URL can be past the end (old link, last job on the page deleted, ...)
        const requested = Number.parseInt(params.get('page'), 10) || 1
        if (data.numOfPages > 0 && requested > data.numOfPages) {
          if (data.numOfPages === 1) params.delete('page')
          else params.set('page', String(data.numOfPages))
          navigate({ search: `?${params}` }, { replace: true })
          return
        }
        setData(data)
        setLoading(false)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setData(EMPTY)
        setError(getErrorMessage(err))
        setLoading(false)
      })

    return () => controller.abort()
  }, [query, reloadKey, navigate])

  // built from the current URL rather than the last render, so a debounced search
  // that fires late doesn't undo a filter picked in the meantime.
  // only non-default values go into the URL, so links stay short
  const updateParams = useCallback(
    (changes, options) => {
      const next = new URLSearchParams(window.location.search)
      Object.entries(changes).forEach(([key, value]) => {
        const isDefault = key === 'page' ? value === 1 : value === DEFAULTS[key]
        if (isDefault || value === '') next.delete(key)
        else next.set(key, value)
      })
      setSearchParams(next, options)
    },
    [setSearchParams]
  )

  const changeFilters = (changes, options) => updateParams({ ...changes, page: 1 }, options)
  const resetFilters = () => setSearchParams({})

  const changePage = (p) => {
    updateParams({ page: p })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const reload = () => setReloadKey((k) => k + 1)

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      await api.delete(`/jobs/${toDelete._id}`)
      toast.success('Job deleted')
      reload()
      // the card that had focus is gone, move focus somewhere sensible
      countRef.current?.focus()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setDeleting(false)
      setToDelete(null)
    }
  }

  const isFiltered = Object.keys(DEFAULTS).some((key) => filters[key] !== DEFAULTS[key])

  return (
    <>
      <PageHeader
        title="All jobs"
        subtitle={active?.personal ? "Everything you've applied to, in one place." : `The shared pipeline of ${active?.name}.`}
      >
        {canWrite && (
          <Link to="/dashboard/add-job" className="btn btn-primary">
            <IconPlus size={16} />
            Add job
          </Link>
        )}
      </PageHeader>

      <JobsFilters values={filters} onChange={changeFilters} onReset={resetFilters} />

      {!isFiltered && page === 1 && <FollowUps reloadKey={reloadKey} onChange={reload} />}

      {error ? (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reload}>
            Try again
          </button>
        </div>
      ) : (
        <p className={styles.count} aria-live="polite" ref={countRef} tabIndex={-1}>
          {loading ? 'Loading…' : `${data.totalJobs} ${data.totalJobs === 1 ? 'job' : 'jobs'} found`}
        </p>
      )}

      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={styles.skeleton} />
          ))}
        </div>
      ) : data.jobs.length === 0 && !error ? (
        <div className={styles.empty}>
          {isFiltered ? (
            <>
              <h2>Nothing matches these filters</h2>
              <p>Try a different search or clear the filters.</p>
              <button type="button" className="btn btn-ghost" onClick={resetFilters}>
                Clear filters
              </button>
            </>
          ) : (
            <>
              <h2>No jobs yet</h2>
              <p>Add the first application you've sent and it will show up here.</p>
              <Link to="/dashboard/add-job" className="btn btn-primary">
                Add a job
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {data.jobs.map((job) => (
            <JobCard
              key={job._id}
              job={job}
              onDelete={setToDelete}
              readOnly={!canWrite}
              showAuthor={!active?.personal}
              editSearch={query ? `?${query}` : ''}
            />
          ))}
        </div>
      )}

      <Pagination page={page} numOfPages={data.numOfPages} onChange={changePage} />

      <Modal open={Boolean(toDelete)} title="Delete this job?" onClose={() => !deleting && setToDelete(null)}>
        {toDelete && (
          <p className={styles.modalText}>
            <b>{toDelete.position}</b> at {toDelete.company} will be removed. This can't be undone.
          </p>
        )}
        <div className={styles.modalActions}>
          <button type="button" className="btn btn-ghost" onClick={() => setToDelete(null)} disabled={deleting}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>
    </>
  )
}

export default AllJobs
