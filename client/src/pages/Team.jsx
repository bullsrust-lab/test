import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import FormRow from '../components/FormRow'
import FormSelect from '../components/FormSelect'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { IconCopy, IconLink, IconPlus } from '../components/Icons'
import api, { getErrorMessage, getFieldErrors } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import { useToast } from '../context/ToastContext'
import { copyText } from '../utils/clipboard'
import { focusFirstError } from '../utils/forms'
import styles from './Team.module.css'

const ROLE_OPTIONS = [
  { value: 'recruiter', label: 'Recruiter: adds and edits jobs' },
  { value: 'viewer', label: 'Viewer: read only' },
  { value: 'owner', label: 'Owner: also manages the team' },
]

const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

function CreateTeamForm({ onCreated, autoFocus }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const { isDemo } = useAuth()
  const toast = useToast()

  const submit = async (e) => {
    e.preventDefault()
    if (name.trim().length < 3) {
      setError('Name must be 3-80 characters')
      focusFirstError({ 'team-name': true })
      return
    }
    setSaving(true)
    try {
      const { data } = await api.post('/orgs', { name: name.trim() })
      toast.success(`${data.organization.name} created`)
      onCreated(data.organization)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className={styles.inlineForm} onSubmit={submit} noValidate>
      <FormRow
        label="Team name"
        name="team-name"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setError('')
        }}
        error={error}
        maxLength={80}
        placeholder="e.g. Northwind Talent"
        autoFocus={autoFocus}
        disabled={isDemo}
      />
      <button type="submit" className="btn btn-primary" disabled={saving || isDemo}>
        {saving ? 'Creating…' : 'Create team'}
      </button>
    </form>
  )
}

function InviteForm({ orgId, onInvited }) {
  const [values, setValues] = useState({ email: '', role: 'recruiter' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const submit = async (e) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) {
      setErrors({ email: 'Please provide a valid email' })
      focusFirstError({ email: true })
      return
    }
    setSaving(true)
    try {
      const { data } = await api.post(`/orgs/${orgId}/invitations`, { ...values, email: values.email.trim() })
      onInvited({ email: data.invitation.email, role: data.invitation.role, inviteUrl: data.inviteUrl })
      setValues({ email: '', role: values.role })
    } catch (err) {
      const fields = getFieldErrors(err)
      setErrors(Object.keys(fields).length ? fields : { email: getErrorMessage(err) })
      if (!Object.keys(fields).length) toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className={styles.inviteForm} onSubmit={submit} noValidate>
      <FormRow
        label="Email"
        name="email"
        type="email"
        value={values.email}
        onChange={(e) => {
          setValues({ ...values, email: e.target.value })
          setErrors({})
        }}
        error={errors.email}
        placeholder="colleague@agency.co.uk"
      />
      <FormSelect
        label="Role"
        name="role"
        value={values.role}
        onChange={(e) => setValues({ ...values, role: e.target.value })}
        options={ROLE_OPTIONS}
      />
      <button type="submit" className="btn btn-primary" disabled={saving}>
        <IconLink size={16} />
        {saving ? 'Creating…' : 'Create invite link'}
      </button>
    </form>
  )
}

function Team() {
  const { active, isOwner, switchOrg, reloadOrgs } = useOrg()
  const { user, isDemo } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [team, setTeam] = useState(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [lastInvite, setLastInvite] = useState(null)
  const [newTeamOpen, setNewTeamOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  // a change that needs a second look: demoting an owner (yourself included) or removing someone
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!active || active.personal) return
    const controller = new AbortController()
    setError('')
    api
      .get(`/orgs/${active._id}`, { signal: controller.signal })
      .then(({ data }) => setTeam(data))
      .catch((err) => {
        if (!controller.signal.aborted) setError(getErrorMessage(err))
      })
    return () => controller.abort()
  }, [active, reloadKey])

  const reload = () => setReloadKey((k) => k + 1)

  const openTeam = (organization) => {
    setNewTeamOpen(false)
    switchOrg(organization._id)
    reloadOrgs()
  }

  const copyInvite = async () => {
    const ok = await copyText(lastInvite.inviteUrl)
    if (ok) toast.success('Invite link copied')
    else toast.error("Couldn't copy, select the link and copy it by hand")
  }

  const cancelInvite = async (invitation) => {
    try {
      await api.delete(`/orgs/${active._id}/invitations/${invitation._id}`)
      toast.success(`Invitation for ${invitation.email} cancelled`)
      if (lastInvite?.email === invitation.email) setLastInvite(null)
      reload()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const changeRole = (member, role) => {
    if (member.role === 'owner' && role !== 'owner') setConfirm({ type: 'demote', member, role })
    else applyRole(member, role)
  }

  const applyRole = async (member, role) => {
    try {
      await api.patch(`/orgs/${active._id}/memberships/${member.membershipId}`, { role })
      toast.success(`${member.name} is now ${role === 'owner' ? 'an owner' : `a ${role}`}`)
      reload()
      // your own role may have changed
      if (member.userId === user?._id) reloadOrgs()
    } catch (err) {
      toast.error(getErrorMessage(err))
      reload()
    }
  }

  const removeMember = async (member) => {
    try {
      await api.delete(`/orgs/${active._id}/memberships/${member.membershipId}`)
      toast.success(`${member.name} was removed from the team`)
      reload()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const confirmChange = async () => {
    const { type, member, role } = confirm
    setConfirm(null)
    if (type === 'demote') await applyRole(member, role)
    else await removeMember(member)
  }

  const leave = async () => {
    setBusy(true)
    try {
      const { data } = await api.delete(`/orgs/${active._id}/memberships/me`)
      toast.success(data.msg)
      setLeaveOpen(false)
      switchOrg(null)
      reloadOrgs()
      navigate('/dashboard/all-jobs')
    } catch (err) {
      toast.error(getErrorMessage(err))
      setLeaveOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const newTeamButton = (
    <button type="button" className="btn btn-ghost" onClick={() => setNewTeamOpen(true)} disabled={isDemo}>
      <IconPlus size={16} />
      New team
    </button>
  )

  const newTeamModal = (
    <Modal open={newTeamOpen} title="Create a team" onClose={() => setNewTeamOpen(false)}>
      <p className={styles.modalText}>You'll be its owner and can invite people right after.</p>
      {newTeamOpen && <CreateTeamForm onCreated={openTeam} autoFocus />}
    </Modal>
  )

  if (!active) return <Spinner />

  if (active.personal) {
    return (
      <>
        <PageHeader title="Team" subtitle="Your Personal workspace is just for you." />
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Work with other people</h2>
          <p className={styles.muted}>
            A team has its own job list that everyone in it sees. Owners invite people by link, recruiters add and edit
            jobs, viewers (a hiring manager, say) can only look.
          </p>
          <CreateTeamForm onCreated={openTeam} />
        </section>
      </>
    )
  }

  if (error) {
    return (
      <>
        <PageHeader title="Team" />
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reload}>
            Try again
          </button>
        </div>
      </>
    )
  }

  if (!team) return <Spinner />

  const owners = team.members.filter((m) => m.role === 'owner').length
  // alone in the team: leaving deletes it, nobody else depends on it
  const alone = team.members.length === 1
  const canLeave = team.role !== 'owner' || owners > 1 || alone

  return (
    <>
      <PageHeader title={team.organization.name} subtitle={`${team.members.length} ${team.members.length === 1 ? 'member' : 'members'} · you're ${team.role === 'owner' ? 'an owner' : `a ${team.role}`}`}>
        {newTeamButton}
      </PageHeader>

      {isOwner && !isDemo && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Invite someone</h2>
          <p className={styles.muted}>
            They don't need an account yet: the link lets them sign up with that email, or join if they already use
            JobTrail. Links work once and expire after 7 days.
          </p>
          <InviteForm orgId={active._id} onInvited={(invite) => {
            setLastInvite(invite)
            reload()
          }} />

          {lastInvite && (
            <div className={styles.linkBox} role="status">
              <p>
                Send this link to <b>{lastInvite.email}</b>. JobTrail doesn't email it for you yet.
              </p>
              <div className={styles.linkRow}>
                <input className="mono" value={lastInvite.inviteUrl} readOnly onFocus={(e) => e.target.select()} aria-label="Invite link" />
                <button type="button" className="btn btn-primary" onClick={copyInvite}>
                  <IconCopy size={16} />
                  Copy
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Members</h2>
        <ul className={styles.members}>
          {team.members.map((member) => (
            <li key={member.membershipId}>
              <span className={styles.avatar} aria-hidden="true">
                {initials(member.name)}
              </span>
              <div className={styles.who}>
                <b>
                  {member.name}
                  {member.userId === user?._id && <span className={styles.you}> (you)</span>}
                </b>
                <span>{member.email}</span>
              </div>
              {isOwner && !isDemo ? (
                <select
                  className={styles.roleSelect}
                  value={member.role}
                  onChange={(e) => changeRole(member, e.target.value)}
                  aria-label={`Role of ${member.name}`}
                >
                  <option value="owner">Owner</option>
                  <option value="recruiter">Recruiter</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <span className={`${styles.role} ${styles[member.role]}`}>{member.role}</span>
              )}
              {isOwner && !isDemo && member.userId !== user?._id && (
                <button
                  type="button"
                  className={`btn btn-sm ${styles.removeBtn}`}
                  onClick={() => setConfirm({ type: 'remove', member })}
                  aria-label={`Remove ${member.name} from the team`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isOwner && team.invitations.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Waiting to join</h2>
          <ul className={styles.members}>
            {team.invitations.map((invitation) => (
              <li key={invitation._id}>
                <div className={styles.who}>
                  <b>{invitation.email}</b>
                  <span className="mono">
                    {invitation.role} · expires {dayjs(invitation.expiresAt).format('MMM D')}
                  </span>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => cancelInvite(invitation)} disabled={isDemo}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.leave}>
        {canLeave ? (
          <button type="button" className={`btn btn-sm ${styles.leaveBtn}`} onClick={() => setLeaveOpen(true)} disabled={isDemo}>
            {alone ? `Delete ${team.organization.name}` : `Leave ${team.organization.name}`}
          </button>
        ) : (
          <p className={styles.muted}>You're the only owner. Make someone else an owner before you can leave.</p>
        )}
      </div>

      <Modal
        open={leaveOpen}
        title={alone ? `Delete ${team.organization.name}?` : `Leave ${team.organization.name}?`}
        onClose={() => !busy && setLeaveOpen(false)}
      >
        <p className={styles.modalText}>
          {alone
            ? "You're the only member, so the team and all of its jobs will be deleted. This can't be undone."
            : "You'll lose access to its jobs. An owner can invite you back."}
        </p>
        <div className={styles.modalActions}>
          <button type="button" className="btn btn-ghost" onClick={() => setLeaveOpen(false)} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={leave} disabled={busy}>
            {busy ? 'Please wait…' : alone ? 'Delete team' : 'Leave team'}
          </button>
        </div>
      </Modal>

      <Modal
        open={Boolean(confirm)}
        title={
          confirm?.type === 'remove'
            ? `Remove ${confirm.member.name}?`
            : confirm?.member.userId === user?._id
              ? 'Step down as owner?'
              : `Make ${confirm?.member.name} a ${confirm?.role}?`
        }
        onClose={() => setConfirm(null)}
      >
        {confirm && (
          <p className={styles.modalText}>
            {confirm.type === 'remove'
              ? `They lose access to ${team.organization.name} right away. Invitations they sent as an owner stop working.`
              : confirm.member.userId === user?._id
                ? `You won't be able to invite people or change roles in ${team.organization.name} any more.`
                : `They won't be able to invite people or change roles any more, and links they sent stop working.`}
          </p>
        )}
        <div className={styles.modalActions}>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={confirmChange}>
            {confirm?.type === 'remove' ? 'Remove' : 'Change role'}
          </button>
        </div>
      </Modal>

      {newTeamModal}
    </>
  )
}

export default Team
