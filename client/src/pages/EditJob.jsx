import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import JobForm from '../components/JobForm'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import api, { getErrorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import styles from './AllJobs.module.css'

function EditJob() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isDemo } = useAuth()
  const toast = useToast()
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')

  // go back to the list with the same filters/page the user came from
  const backTo = `/dashboard/all-jobs${location.state?.from || ''}`

  useEffect(() => {
    const controller = new AbortController()
    api
      .get(`/jobs/${id}`, { signal: controller.signal })
      .then(({ data }) => setJob(data.job))
      .catch((err) => {
        if (controller.signal.aborted) return
        setError(
          err.response?.status === 404 ? "This job doesn't exist or was deleted" : getErrorMessage(err)
        )
      })
    return () => controller.abort()
  }, [id])

  const updateJob = async (values) => {
    await api.patch(`/jobs/${id}`, values)
    toast.success('Changes saved')
    navigate(backTo)
  }

  if (error) {
    return (
      <>
        <PageHeader title="Edit job" />
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <Link to="/dashboard/all-jobs" className="btn btn-ghost btn-sm">
            Back to all jobs
          </Link>
        </div>
      </>
    )
  }

  if (!job) return <Spinner />

  const { position, company, jobLocation, status, jobType } = job

  return (
    <>
      <PageHeader title="Edit job" subtitle={`${position} at ${company}`} />
      <JobForm
        initialValues={{ position, company, jobLocation, status, jobType }}
        submitLabel="Save changes"
        onSubmit={updateJob}
        onCancel={() => navigate(backTo)}
        disabled={isDemo}
      />
    </>
  )
}

export default EditJob
