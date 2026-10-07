import { beforeEach, describe, expect, it } from 'vitest'
import {
  app,
  bearer,
  createTeam,
  invite,
  PASSWORD,
  personalOrgOf,
  register,
  request,
  teamWithRoles,
  useDatabase,
} from './helpers.js'
import Invitation, { hashToken } from '../models/Invitation.js'
import Membership from '../models/Membership.js'
import User from '../models/User.js'

useDatabase()

const accept = (token, { auth, body } = {}) => {
  const req = request(app).post(`/api/v1/invitations/${token}/accept`)
  if (auth) req.set(bearer(auth))
  return req.send(body ?? {})
}

describe('creating invitations', () => {
  let owner
  let org

  beforeEach(async () => {
    owner = await register({ name: 'Olivia' })
    org = await createTeam(owner.token)
  })

  it('returns a token and a link, stores only a hash, expires in 7 days', async () => {
    const res = await invite(owner.token, org._id, 'New.Person@Test.com', 'recruiter')
    expect(res.status).toBe(201)
    expect(res.body.token).toMatch(/^[\w-]{43}$/)
    expect(res.body.inviteUrl).toMatch(new RegExp(`/invite/${res.body.token}$`))
    expect(res.body.invitation).toMatchObject({ email: 'new.person@test.com', role: 'recruiter', status: 'pending' })
    expect(res.body.invitation.tokenHash).toBeUndefined()

    const stored = await Invitation.findOne().select('+tokenHash')
    expect(stored.tokenHash).toBe(hashToken(res.body.token))
    const days = (stored.expiresAt - Date.now()) / 864e5
    expect(days).toBeGreaterThan(6.99)
    expect(days).toBeLessThanOrEqual(7)
  })

  it('is owner-only', async () => {
    const { recruiter, viewer, org: team } = await teamWithRoles()
    const stranger = await register()
    expect((await invite(recruiter.token, team._id, 'x@test.com')).status).toBe(403)
    expect((await invite(viewer.token, team._id, 'x@test.com')).status).toBe(403)
    expect((await invite(stranger.token, team._id, 'x@test.com')).status).toBe(403)
  })

  it('validates input and refuses Personal workspaces and existing members', async () => {
    expect((await invite(owner.token, org._id, 'not-an-email')).status).toBe(400)
    expect((await invite(owner.token, org._id, 'x@test.com', 'admin')).status).toBe(400)
    expect((await invite(owner.token, 'nope', 'x@test.com')).status).toBe(400)

    const personal = await personalOrgOf(owner.user._id)
    expect((await invite(owner.token, personal._id, 'x@test.com')).status).toBe(400)
    expect((await invite(owner.token, org._id, owner.user.email)).status).toBe(409)
  })

  it('replaces the previous link when the same address is invited again', async () => {
    const first = await invite(owner.token, org._id, 'x@test.com')
    const second = await invite(owner.token, org._id, 'x@test.com', 'viewer')
    expect((await request(app).get(`/api/v1/invitations/${first.body.token}`)).status).toBe(410)
    expect((await request(app).get(`/api/v1/invitations/${second.body.token}`)).status).toBe(200)
  })

  it('can be revoked by the owner', async () => {
    const res = await invite(owner.token, org._id, 'x@test.com')
    const revoke = await request(app)
      .delete(`/api/v1/orgs/${org._id}/invitations/${res.body.invitation._id}`)
      .set(bearer(owner.token))
    expect(revoke.status).toBe(200)
    expect((await accept(res.body.token, { body: { password: PASSWORD } })).status).toBe(410)
  })
})

describe('preview', () => {
  it('shows the org, role and whether the address already has an account', async () => {
    const owner = await register({ name: 'Olivia' })
    const existing = await register({ email: 'existing@test.com' })
    const org = await createTeam(owner.token, 'Northwind Talent')

    const forNew = await invite(owner.token, org._id, 'new@test.com', 'viewer')
    const forExisting = await invite(owner.token, org._id, existing.user.email)

    const preview = await request(app).get(`/api/v1/invitations/${forNew.body.token}`)
    expect(preview.status).toBe(200)
    expect(preview.body).toMatchObject({
      invitation: { email: 'new@test.com', role: 'viewer', invitedBy: 'Olivia', organization: { name: 'Northwind Talent' } },
      hasAccount: false,
    })
    expect((await request(app).get(`/api/v1/invitations/${forExisting.body.token}`)).body.hasAccount).toBe(true)
    expect((await request(app).get(`/api/v1/invitations/${'x'.repeat(43)}`)).status).toBe(404)
  })
})

describe('accepting', () => {
  let owner
  let org

  beforeEach(async () => {
    owner = await register({ name: 'Olivia' })
    org = await createTeam(owner.token)
  })

  it('flow 1: a signed-in invitee with the matching email joins, the link is used up', async () => {
    const invitee = await register({ email: 'ravi@test.com' })
    const { body } = await invite(owner.token, org._id, 'RAVI@test.com', 'recruiter')

    const res = await accept(body.token, { auth: invitee.token })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ organization: { name: org.name }, role: 'recruiter' })
    expect(await Membership.findOne({ user: invitee.user._id, organization: org._id })).toMatchObject({ role: 'recruiter' })
    expect((await Invitation.findOne()).status).toBe('accepted')

    expect((await accept(body.token, { auth: invitee.token })).status).toBe(410)
    // and the team now shows up for them
    const orgs = (await request(app).get('/api/v1/orgs').set(bearer(invitee.token))).body.organizations
    expect(orgs.map((o) => o.name)).toContain(org.name)
  })

  it('flow 2: an invitee without an account sets a password and is signed in', async () => {
    const { body } = await invite(owner.token, org._id, 'mei@test.com', 'viewer')

    const res = await accept(body.token, { body: { password: PASSWORD } })
    expect(res.status).toBe(201)
    expect(res.body.user).toMatchObject({ email: 'mei@test.com', name: 'mei' })
    expect(res.body.token).toBeTypeOf('string')
    expect(res.body.role).toBe('viewer')

    const user = await User.findOne({ email: 'mei@test.com' })
    expect(await Membership.findOne({ user: user._id, organization: org._id })).toMatchObject({ role: 'viewer' })
    // a new account always gets its own Personal workspace too
    expect(await personalOrgOf(user._id)).not.toBeNull()
    expect((await Invitation.findOne()).status).toBe('accepted')

    const login = await request(app).post('/api/v1/auth/login').send({ email: 'mei@test.com', password: PASSWORD })
    expect(login.status).toBe(200)
    expect((await accept(body.token, { body: { password: PASSWORD } })).status).toBe(410)
  })

  it('flow 2 takes an optional name and checks the password', async () => {
    const { body } = await invite(owner.token, org._id, 'mei@test.com')
    expect((await accept(body.token)).status).toBe(400)
    expect((await accept(body.token, { body: { password: 'password' } })).status).toBe(400)
    const res = await accept(body.token, { body: { password: PASSWORD, name: 'Mei Chen' } })
    expect(res.body.user.name).toBe('Mei Chen')
  })

  it('refuses a signed-in user with a different email (403), the link stays valid', async () => {
    const wrong = await register({ email: 'someone.else@test.com' })
    const { body } = await invite(owner.token, org._id, 'ravi@test.com')

    const res = await accept(body.token, { auth: wrong.token })
    expect(res.status).toBe(403)
    expect(res.body.msg).toMatch(/ravi@test\.com/)
    expect((await Invitation.findOne()).status).toBe('pending')
  })

  it('asks an anonymous invitee who already has an account to log in (409)', async () => {
    await register({ email: 'ravi@test.com' })
    const { body } = await invite(owner.token, org._id, 'ravi@test.com')

    const res = await accept(body.token, { body: { password: PASSWORD } })
    expect(res.status).toBe(409)
    expect((await Invitation.findOne()).status).toBe('pending')
  })

  it('answers 410 for an expired link and 404 for a made-up one', async () => {
    const { body } = await invite(owner.token, org._id, 'mei@test.com')
    await Invitation.updateOne({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })

    const res = await accept(body.token, { body: { password: PASSWORD } })
    expect(res.status).toBe(410)
    expect(res.body.msg).toMatch(/expired/)
    expect(await User.exists({ email: 'mei@test.com' })).toBeNull()
    expect((await accept('y'.repeat(43), { body: { password: PASSWORD } })).status).toBe(404)
  })

  it('lets only one of two simultaneous acceptances through', async () => {
    const { body } = await invite(owner.token, org._id, 'mei@test.com')
    const results = await Promise.all([
      accept(body.token, { body: { password: PASSWORD } }),
      accept(body.token, { body: { password: PASSWORD } }),
    ])
    expect(results.map((r) => r.status).filter((s) => s === 201)).toHaveLength(1)
    expect(await User.countDocuments({ email: 'mei@test.com' })).toBe(1)
    expect(await Membership.countDocuments({ organization: org._id })).toBe(2)
  })
})
