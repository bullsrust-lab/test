import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import JobCard from '../components/JobCard'
import JobsFilters from '../components/JobsFilters'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import { IconPlus } from '../components/Icons'
import api, { getErrorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { PAGE_SIZE } from '../utils/constants'
import styles from './AllJobs.module.css'

const DEFAULTS = { search: '', status: 'all', jobType: 'all', sort: 'latest' }

function AllJobs() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState({ jobs: [], totalJobs: 0, numOfPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const { isDemo } = useAuth()
  const toast = useToast()

  const filters = Object.fromEntries(
    Object.entries(DEFAULTS).map(([key, value]) => [key, searchParams.get(key) ?? value])
  )
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const query = searchParams.toString()

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')

    api
      .get('/jobs', { params: { ...Object.fromEntries(new URLSearchParams(query)), limit: PAGE_SIZE }, signal: controller.signal })
      .then(({ data }) => setData(data))
      .catch((err) => {
        if (!controller.signal.aborted) setError(getErrorMessage(err))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [query, reloadKey])

  // only non-default values go into the URL, so links stay short
  const updateParams = useCallback(
    (changes) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        Object.entries(changes).forEach(([key, value]) => {
          const isDefault = key === 'page' ? value === 1 : value === DEFAULTS[key]
          if (isDefault || value === '') next.delete(key)
          else next.set(key, value)
        })
        return next
      })
    },
    [setSearchParams]
  )

  const changeFilter = (key, value) => updateParams({ [key]: value, page: 1 })

  const changePage = (p) => {
    updateParams({ page: p })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      await api.delete(`/jobs/${toDelete._id}`)
      toast.success('Job deleted')
      // if that was the last job on this page, step back one page
      if (data.jobs.length === 1 && page > 1) updateParams({ page: page - 1 })
      else setReloadKey((k) => k + 1)
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
      <PageHeader title="All jobs" subtitle="Everything you've applied to, in one place.">
        <Link to="/dashboard/add-job" className="btn btn-primary">
          <IconPlus size={16} />
          Add job
        </Link>
      </PageHeader>

      <JobsFilters values={filters} onChange={changeFilter} onReset={() => setSearchParams({})} />

      <p className={styles.count} aria-live="polite">
        {loading ? 'Loading…' : `${data.totalJobs} ${data.totalJobs === 1 ? 'job' : 'jobs'} found`}
      </p>

      {error && <p className={styles.error}>{error}</p>}

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
              <button type="button" className="btn btn-ghost" onClick={() => setSearchParams({})}>
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
              readOnly={isDemo}
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
