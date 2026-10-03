import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import FormRow from '../components/FormRow'
import Logo from '../components/Logo'
import { IconEye } from '../components/Icons'
import api, { getErrorMessage, getFieldErrors } from '../api/client'
import { useAuth } from '../context/AuthContext'
import styles from './Register.module.css'

const initialValues = { name: '', email: '', password: '' }

function Register() {
  const [isMember, setIsMember] = useState(true)
  const [values, setValues] = useState(initialValues)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(() =>
    sessionStorage.getItem('sessionExpired') ? 'Your session has expired, please log in again.' : ''
  )
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { token, login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    sessionStorage.removeItem('sessionExpired')
  }, [])

  if (token) return <Navigate to="/dashboard" replace />

  const handleChange = (e) => {
    setValues({ ...values, [e.target.name]: e.target.value })
    setFieldErrors({ ...fieldErrors, [e.target.name]: undefined })
  }

  const toggleMember = () => {
    setIsMember(!isMember)
    setError('')
    setFieldErrors({})
  }

  const authenticate = async (request) => {
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const { data } = await request()
      login(data)
      navigate('/dashboard')
    } catch (err) {
      const fields = getFieldErrors(err)
      setFieldErrors(fields)
      // field errors are already shown under the inputs
      if (!Object.keys(fields).length) setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const { name, email, password } = values
    const body = isMember ? { email, password } : { name, email, password }
    authenticate(() => api.post(isMember ? '/auth/login' : '/auth/register', body))
  }

  return (
    <div className={styles.page}>
      <aside className={styles.side}>
        <Logo />
        <div>
          <p className={styles.quote}>Sent forty applications? Know which ones wrote back.</p>
          <p className={styles.quoteBy}>Company, role, status and date for every job, in one list.</p>
        </div>
        <p className={`mono ${styles.sideFoot}`}>pending · interview · declined</p>
      </aside>

      <main className={styles.main}>
        <div className={styles.mobileLogo}>
          <Logo />
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <h1>{isMember ? 'Log in' : 'Create an account'}</h1>
          <p className={styles.lead}>
            {isMember ? 'Welcome back. Your job list is where you left it.' : 'Takes a few seconds, no email confirmation.'}
          </p>

          {notice && <p className={styles.notice}>{notice}</p>}

          <div className={styles.fields}>
            {!isMember && (
              <FormRow
                label="Name"
                name="name"
                value={values.name}
                onChange={handleChange}
                error={fieldErrors.name}
                autoComplete="name"
                required
              />
            )}
            <FormRow
              label="Email"
              name="email"
              type="email"
              value={values.email}
              onChange={handleChange}
              error={fieldErrors.email}
              autoComplete="email"
              required
            />
            <FormRow
              label="Password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={values.password}
              onChange={handleChange}
              error={fieldErrors.password}
              autoComplete={isMember ? 'current-password' : 'new-password'}
              minLength={isMember ? undefined : 6}
              required
            >
              <button
                type="button"
                className={styles.peek}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <IconEye off={showPassword} size={17} />
              </button>
            </FormRow>
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Please wait…' : isMember ? 'Log in' : 'Create account'}
          </button>

          <div className={styles.divider}>
            <span>or</span>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-block"
            disabled={submitting}
            onClick={() => authenticate(() => api.post('/auth/demo'))}
          >
            Look around with a demo account
          </button>

          <p className={styles.switch}>
            {isMember ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button type="button" onClick={toggleMember}>
              {isMember ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </form>
      </main>
    </div>
  )
}

export default Register
