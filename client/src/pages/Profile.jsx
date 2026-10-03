import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import FormRow from '../components/FormRow'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import api, { getErrorMessage, getFieldErrors } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import styles from './Profile.module.css'

function Profile() {
  const { isDemo, login } = useAuth()
  const toast = useToast()
  const [user, setUser] = useState(null)
  const [values, setValues] = useState({ name: '', email: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .get('/users/me')
      .then(({ data }) => {
        setUser(data.user)
        setValues({ name: data.user.name, email: data.user.email })
      })
      .catch((err) => toast.error(getErrorMessage(err)))
  }, [toast])

  if (!user) return <Spinner />

  const changed = values.name.trim() !== user.name || values.email.trim() !== user.email

  const handleChange = (e) => {
    setValues({ ...values, [e.target.name]: e.target.value })
    setErrors({ ...errors, [e.target.name]: undefined })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { data } = await api.patch('/users/me', values)
      login(data)
      setUser(data.user)
      toast.success('Profile updated')
    } catch (err) {
      setErrors(getFieldErrors(err))
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Profile" />

      <div className={styles.layout}>
        <section className={styles.card}>
          <dl className={styles.details}>
            <div>
              <dt>Name</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd className="mono">{dayjs(user.createdAt).format('MMM D, YYYY')}</dd>
            </div>
          </dl>
        </section>

        <form className={styles.card} onSubmit={handleSubmit} noValidate>
          <h2 className={styles.formTitle}>Edit details</h2>
          {isDemo && <p className={styles.hint}>The demo account can't be changed.</p>}
          <fieldset className={styles.fields} disabled={isDemo || saving}>
            <FormRow label="Name" name="name" value={values.name} onChange={handleChange} error={errors.name} />
            <FormRow
              label="Email"
              name="email"
              type="email"
              value={values.email}
              onChange={handleChange}
              error={errors.email}
            />
          </fieldset>
          <button type="submit" className="btn btn-primary" disabled={isDemo || saving || !changed}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>
    </>
  )
}

export default Profile
