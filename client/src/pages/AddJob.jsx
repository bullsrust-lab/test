import JobForm from '../components/JobForm'
import PageHeader from '../components/PageHeader'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

function AddJob() {
  const { isDemo } = useAuth()
  const toast = useToast()

  const createJob = async (values) => {
    await api.post('/jobs', values)
    toast.success('Job added')
    return true
  }

  return (
    <>
      <PageHeader title="Add job" subtitle="Log an application you've just sent." />
      <JobForm submitLabel="Add job" onSubmit={createJob} disabled={isDemo} />
    </>
  )
}

export default AddJob
