import JobForm from '../components/JobForm'
import PageHeader from '../components/PageHeader'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import { useToast } from '../context/ToastContext'
import styles from './AllJobs.module.css'

function AddJob() {
  const { isDemo } = useAuth()
  const { active, canWrite } = useOrg()
  const toast = useToast()

  const createJob = async (values) => {
    await api.post('/jobs', values)
    toast.success('Job added')
    return true
  }

  return (
    <>
      <PageHeader
        title="Add job"
        subtitle={active?.personal ? "Log an application you've just sent." : `Adds it to ${active?.name}, everyone in the team will see it.`}
      />
      {!canWrite && (
        <p className={styles.notice}>
          {isDemo
            ? 'The demo account is read-only.'
            : `You're a viewer in ${active?.name}: you can see the pipeline, but not add to it.`}
        </p>
      )}
      <JobForm submitLabel="Add job" onSubmit={createJob} disabled={!canWrite} />
    </>
  )
}

export default AddJob
