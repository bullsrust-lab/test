import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import FormRow from '../components/FormRow'
import Logo from '../components/Logo'
import Spinner from '../components/Spinner'
import api, { getErrorMessage, getFieldErrors } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import { useToast } from '../context/ToastContext'
import useDocumentTitle from '../hooks/useDocumentTitle'
import { focusFirstError } from '../utils/forms'
import styles from './AcceptInvite.module.css'

const ROLE_TEXT = {
  owner: 'an owner',
  recruiter: 'a recruiter',
  viewer: 'a viewer',
}

const ROLE_HINT = {
  owner: 'You will be able to add jobs and manage the team.',
  recruiter: 'You will be able to add and edit jobs in the shared list.',
  viewer: 'You will be able to see the shared list, but not change it.',
}

// One page, four situations: signed in as the invited address (one click), signed in as someone
// else (log out first), not signed in with an account (log in), no account (set a password).
// The page can't know in advance whether the address has an account (the API deliberately doesn't
// say), so it offers "create" and switches to "log in" by choice or when the API answers 409.
function AcceptInvite() {
  const { token: inviteToken } = useParams()
  const { token, user, login, logout } = useAuth()
  const { switchOrg, reloadOrgs } = useOrg()
  const navigate = useNavigate()
  const toast = useToast()

  const [invite, setInvite] = useState(null)
  // the link can't be used (malformed 400, unknown 404, used or expired 410) vs. the preview just
  // failed to load (network, 5xx)
  const [problem, setProblem] = useState('')
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [values, setValues] = useState({ name: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // log in instead of creating an account: chosen by the user, or after a 409 from the API
  const [mustLogIn, setMustLogIn] = useState(false)

  useDocumentTitle(invite ? `Join ${invite.invitation.organization.name}` : 'Invitation')

  useEffect(() => {
    const controller = new AbortController()
    setLoadError('')
    api
      .get(`/invitations/${inviteToken}`, { signal: controller.signal })
      .then(({ data }) => setInvite(data))
      .catch((err) => {
        if (controller.signal.aborted) return
        const status = err.response?.status
        // a link cut short by a chat app comes back as 400, retrying won't fix it either
        if (status === 400 || status === 404 || status === 410) setProblem(getErrorMessage(err))
        else setLoadError(getErrorMessage(err))
      })
    return () => controller.abort()
  }, [inviteToken, reloadKey])

  if (problem) {
    return (
      <Shell>
        <h1 className={styles.title}>This link can't be used</h1>
        <p className={styles.lead}>{problem}. Ask whoever invited you for a new link.</p>
        <Link to={token ? '/dashboard' : '/'} className="btn btn-ghost">
          {token ? 'Go to your dashboard' : 'Back to home'}
        </Link>
      </Shell>
    )
  }

  if (loadError) {
    return (
      <Shell>
        <h1 className={styles.title}>Couldn't load the invitation</h1>
        <p className={styles.lead}>{loadError}. The link itself may be fine, try again in a moment.</p>
        <button type="button" className="btn btn-primary" onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </button>
      </Shell>
    )
  }

  if (!invite) return <Spinner full />

  const { invitation } = invite
  const org = invitation.organization
  const signedInAs = token ? user?.email : null
  const mode = signedInAs
    ? signedInAs === invitation.email
      ? 'join'
      : 'mismatch'
    : mustLogIn
      ? 'login'
      : 'signup'

  const finish = () => {
    switchOrg(org._id)
    reloadOrgs()
    toast.success(`You joined ${org.name}`)
    navigate('/dashboard/all-jobs', { replace: true })
  }

  const fail = (err) => {
    const status = err.response?.status
    if (status === 410) return setProblem(getErrorMessage(err))
    if (status === 409) {
      setMustLogIn(true)
      setFormError('There is already an account with this email. Log in to accept.')
      return
    }
    const fields = getFieldErrors(err)
    setErrors(fields)
    focusFirstError(fields)
    if (!Object.keys(fields).length) setFormError(getErrorMessage(err))
  }

  const run = async (steps) => {
    setSubmitting(true)
    setFormError('')
    try {
      await steps()
      finish()
    } catch (err) {
      fail(err)
      setSubmitting(false)
    }
  }

  const join = () => run(() => api.post(`/invitations/${inviteToken}/accept`))

  const submitSignup = (e) => {
    e.preventDefault()
    const found = {}
    if (values.password.length < 8) found.password = 'Password must be at least 8 characters'
    if (values.name && values.name.trim().length < 2) found.name = 'Name must be at least 2 characters'
    if (Object.keys(found).length) {
      setErrors(found)
      focusFirstError(found)
      return
    }
    run(async () => {
      const body = { password: values.password, ...(values.name.trim() && { name: values.name.trim() }) }
      const { data } = await api.post(`/invitations/${inviteToken}/accept`, body)
      login({ user: data.user, token: data.token })
    })
  }

  const submitLogin = (e) => {
    e.preventDefault()
    if (!values.password) {
      setErrors({ password: 'Password is required' })
      focusFirstError({ password: true })
      return
    }
    run(async () => {
      let session
      try {
        session = await api.post('/auth/login', { email: invitation.email, password: values.password })
      } catch (err) {
        if (err.response?.status === 401) {
          const wrong = new Error('Wrong password')
          wrong.response = { data: { msg: 'Wrong password for this account' } }
          throw wrong
        }
        throw err
      }
      login(session.data)
      await api.post(`/invitations/${inviteToken}/accept`, {}, { headers: { Authorization: `Bearer ${session.data.token}` } })
    })
  }

  const change = (e) => {
    setValues({ ...values, [e.target.name]: e.target.value })
    setErrors({ ...errors, [e.target.name]: undefined })
  }

  const switchForm = (toLogin) => {
    setMustLogIn(toLogin)
    setFormError('')
    setErrors({})
    setValues({ ...values, password: '' })
  }

  return (
    <Shell>
      <p className={styles.eyebrow}>Invitation</p>
      <h1 className={styles.title}>
        Join <span className={styles.org}>{org.name}</span>
      </h1>
      <p className={styles.lead}>
        {invitation.invitedBy ? `${invitation.invitedBy} invited you` : "You've been invited"} as{' '}
        <b>{ROLE_TEXT[invitation.role]}</b>. {ROLE_HINT[invitation.role]}
      </p>
      <p className={`mono ${styles.meta}`}>
        for {invitation.email} · expires {dayjs(invitation.expiresAt).format('MMM D')}
      </p>

      {formError && (
        <p className={styles.error} role="alert">
          {formError}
        </p>
      )}

      {mode === 'join' && (
        <button type="button" className="btn btn-primary btn-block" onClick={join} disabled={submitting}>
          {submitting ? 'Joining…' : `Join ${org.name}`}
        </button>
      )}

      {mode === 'mismatch' && (
        <div className={styles.warning} role="alert">
          <p>
            You're signed in as <b>{signedInAs}</b>, but this invitation is for <b>{invitation.email}</b>.
          </p>
          <button type="button" className="btn btn-ghost btn-block" onClick={logout}>
            Log out and continue as {invitation.email}
          </button>
        </div>
      )}

      {mode === 'login' && (
        <form onSubmit={submitLogin} noValidate className={styles.form}>
          <p className={styles.formLead}>Log in with your JobTrail account to accept.</p>
          <FormRow label="Email" name="email" value={invitation.email} readOnly />
          <FormRow
            label="Password"
            name="password"
            type="password"
            value={values.password}
            onChange={change}
            error={errors.password}
            autoComplete="current-password"
            autoFocus
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Please wait…' : 'Log in and join'}
          </button>
          <p className={styles.switch}>
            New to JobTrail?{' '}
            <button type="button" onClick={() => switchForm(false)}>
              Create an account instead
            </button>
          </p>
        </form>
      )}

      {mode === 'signup' && (
        <form onSubmit={submitSignup} noValidate className={styles.form}>
          <p className={styles.formLead}>New here? Create your account to join, the email is already set.</p>
          <FormRow label="Email" name="email" value={invitation.email} readOnly />
          <FormRow
            label="Name (optional)"
            name="name"
            value={values.name}
            onChange={change}
            error={errors.name}
            placeholder={invitation.email.split('@')[0]}
            autoComplete="name"
            maxLength={50}
          />
          <FormRow
            label="Password"
            name="password"
            type="password"
            value={values.password}
            onChange={change}
            error={errors.password}
            hint="At least 8 characters"
            autoComplete="new-password"
            autoFocus
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Please wait…' : 'Create account and join'}
          </button>
          <p className={styles.switch}>
            Already use JobTrail with this email?{' '}
            <button type="button" onClick={() => switchForm(true)}>
              Log in instead
            </button>
          </p>
        </form>
      )}
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <Logo />
      </div>
      <section className={styles.card}>{children}</section>
    </main>
  )
}

export default AcceptInvite
