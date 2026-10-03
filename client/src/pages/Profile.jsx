import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import FormRow from '../components/FormRow'
import PageHeader from '../components/PageHeader'
import api, { getErrorMessage, getFieldErrors } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { focusFirstError } from '../utils/forms'
import styles from './Profile.module.css'

function Profile() {
  const { user: storedUser, isDemo, login } = useAuth()
  const toast = useToast()
  // name and email are already known from login, the request only adds "member since"
  const [user, setUser] = useState(storedUser)
  const [values, setValues] = useState({ name: storedUser?.name ?? '', email: storedUser?.email ?? '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoadError('')
    api
      .get('/users/me', { signal: controller.signal })
      .then(({ data }) => {
        setUser(data.user)
        setValues({ name: data.user.name, email: data.user.email })
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(getErrorMessage(err))
      })
    return () => controller.abort()
  }, [reloadKey])

  const changed =
    user && (values.name.trim() !== user.name || values.email.trim().toLowerCase() !== user.email)

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
      setValues({ name: data.user.name, email: data.user.email })
      toast.success('Profile updated')
    } catch (err) {
      const fields = getFieldErrors(err)
      setErrors(fields)
      focusFirstError(fields)
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Profile" />

      {loadError && (
        <div className={styles.error} role="alert">
          <span>Couldn't load your profile: {loadError}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </button>
        </div>
      )}

      <div className={styles.layout}>
        <section className={styles.card}>
          <dl className={styles.details}>
            <div>
              <dt>Name</dt>
              <dd>{user?.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user?.email}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd className="mono">{user?.createdAt ? dayjs(user.createdAt).format('MMM D, YYYY') : '…'}</dd>
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
