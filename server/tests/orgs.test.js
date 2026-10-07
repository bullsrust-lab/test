import { describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import {
  app,
  bearer,
  createTeam,
  newJob,
  PASSWORD,
  personalOrgOf,
  register,
  request,
  teamWithRoles,
  useDatabase,
} from './helpers.js'
import Job from '../models/Job.js'
import Membership from '../models/Membership.js'
import Organization from '../models/Organization.js'
import User from '../models/User.js'

useDatabase()

describe('organizations', () => {
  it('lists the Personal workspace for a new user', async () => {
    const { token } = await register()
    const res = await request(app).get('/api/v1/orgs').set(bearer(token))
    expect(res.status).toBe(200)
    expect(res.body.organizations).toEqual([expect.objectContaining({ name: 'Personal', personal: true, role: 'owner' })])
  })

  it('creates a team with a slug from its name, unique across teams', async () => {
    const a = await register()
    const b = await register()
    const first = await createTeam(a.token, 'Northwind Talent!')
    const second = await createTeam(b.token, 'Northwind  Talent')
    expect(first).toMatchObject({ name: 'Northwind Talent!', slug: 'northwind-talent', personal: false })
    expect(second.slug).toBe('northwind-talent-2')

    const orgs = (await request(app).get('/api/v1/orgs').set(bearer(a.token))).body.organizations
    expect(orgs.map((o) => [o.name, o.role])).toEqual([
      ['Personal', 'owner'],
      ['Northwind Talent!', 'owner'],
    ])
  })

  it('validates the name length', async () => {
    const { token } = await register()
    const post = (name) => request(app).post('/api/v1/orgs').set(bearer(token)).send({ name })
    expect((await post('ab')).status).toBe(400)
    expect((await post('x'.repeat(81))).status).toBe(400)
    expect((await post(42)).status).toBe(400)
    expect((await post('personal')).status).toBe(400)
  })

  it("never lets a team take a Personal workspace's slug", async () => {
    const victim = await User.create({ name: 'Late', email: 'late@test.com', password: PASSWORD })
    const attacker = await register()
    const team = await createTeam(attacker.token, `personal-${victim._id}`)
    expect(team.slug).toBe(`team-personal-${victim._id}`)

    // the victim's workspace can still be created on their first request
    expect((await request(app).get('/api/v1/jobs').set(bearer(victim.createJWT()))).status).toBe(200)
  })
})

describe('active organization (X-Org-Id)', () => {
  it('scopes jobs to the header, and to Personal without it', async () => {
    const { token } = await register()
    const team = await createTeam(token)

    await request(app).post('/api/v1/jobs').set(bearer(token, team._id)).send({ ...newJob, position: 'Team job' })
    await request(app).post('/api/v1/jobs').set(bearer(token)).send({ ...newJob, position: 'My job' })

    const inTeam = await request(app).get('/api/v1/jobs').set(bearer(token, team._id))
    const inPersonal = await request(app).get('/api/v1/jobs').set(bearer(token))
    expect(inTeam.body.jobs.map((j) => j.position)).toEqual(['Team job'])
    expect(inPersonal.body.jobs.map((j) => j.position)).toEqual(['My job'])
  })

  it('rejects a malformed id with 400 and an org you are not in with 403', async () => {
    const { token } = await register()
    const stranger = await register()
    const team = await createTeam(stranger.token)

    expect((await request(app).get('/api/v1/jobs').set(bearer(token, 'nope'))).status).toBe(400)
    expect((await request(app).get('/api/v1/jobs').set(bearer(token, team._id))).status).toBe(403)
    // an org that doesn't exist answers the same, so ids can't be probed
    expect((await request(app).get('/api/v1/jobs').set(bearer(token, new mongoose.Types.ObjectId()))).status).toBe(403)
  })

  it('creates the Personal workspace on the fly for a pre-v2 account, with its jobs', async () => {
    const legacy = await User.create({ name: 'Legacy', email: 'legacy@test.com', password: PASSWORD })
    await Job.collection.insertOne({ ...newJob, status: 'pending', jobType: 'full-time', createdBy: legacy._id, createdAt: new Date() })

    const res = await request(app).get('/api/v1/jobs').set(bearer(legacy.createJWT()))
    expect(res.status).toBe(200)
    expect(res.body.totalJobs).toBe(1)
    expect(await personalOrgOf(legacy._id)).not.toBeNull()
  })

  it('picks up jobs the old version wrote after the migration when the org list loads', async () => {
    const { token, user } = await register()
    await Job.collection.insertOne({ ...newJob, status: 'pending', jobType: 'full-time', createdBy: new mongoose.Types.ObjectId(user._id), createdAt: new Date() })

    await request(app).get('/api/v1/orgs').set(bearer(token))
    expect((await request(app).get('/api/v1/jobs').set(bearer(token))).body.totalJobs).toBe(1)
  })

  it('does not write anything on a plain read in the Personal workspace', async () => {
    const { token, user } = await register()
    const before = (await personalOrgOf(user._id)).updatedAt
    await request(app).get('/api/v1/jobs').set(bearer(token))
    expect((await personalOrgOf(user._id)).updatedAt).toEqual(before)
  })

  it('shows who added each job in a shared list', async () => {
    const { owner, recruiter, org } = await teamWithRoles()
    await request(app).post('/api/v1/jobs').set(bearer(owner.token, org._id)).send({ ...newJob, position: 'A' })
    await request(app).post('/api/v1/jobs').set(bearer(recruiter.token, org._id)).send({ ...newJob, position: 'B' })

    const res = await request(app).get('/api/v1/jobs?sort=a-z').set(bearer(recruiter.token, org._id))
    expect(res.body.jobs.map((j) => [j.position, j.createdByName])).toEqual([
      ['A', 'Olivia Owner'],
      ['B', 'Ravi Recruiter'],
    ])
  })
})

describe('members', () => {
  it('lists members for everyone, pending invitations only for owners', async () => {
    const { owner, viewer, org } = await teamWithRoles()
    await request(app).post(`/api/v1/orgs/${org._id}/invitations`).set(bearer(owner.token)).send({ email: 'new@test.com', role: 'viewer' })

    const asOwner = await request(app).get(`/api/v1/orgs/${org._id}`).set(bearer(owner.token))
    expect(asOwner.body.members.map((m) => m.role)).toEqual(['owner', 'recruiter', 'viewer'])
    expect(asOwner.body.invitations).toHaveLength(1)

    const asViewer = await request(app).get(`/api/v1/orgs/${org._id}`).set(bearer(viewer.token))
    expect(asViewer.body.role).toBe('viewer')
    expect(asViewer.body.invitations).toEqual([])

    const stranger = await register()
    expect((await request(app).get(`/api/v1/orgs/${org._id}`).set(bearer(stranger.token))).status).toBe(403)
  })

  it('lets an owner change roles, but never removes the last owner', async () => {
    const { owner, recruiter, org } = await teamWithRoles()
    const members = (await request(app).get(`/api/v1/orgs/${org._id}`).set(bearer(owner.token))).body.members
    const id = (role) => members.find((m) => m.role === role).membershipId
    const patch = (token, membershipId, role) =>
      request(app).patch(`/api/v1/orgs/${org._id}/memberships/${membershipId}`).set(bearer(token)).send({ role })

    expect((await patch(recruiter.token, id('viewer'), 'recruiter')).status).toBe(403)
    expect((await patch(owner.token, id('owner'), 'viewer')).status).toBe(409)
    expect((await patch(owner.token, id('viewer'), 'nope')).status).toBe(400)

    const promoted = await patch(owner.token, id('recruiter'), 'owner')
    expect(promoted.status).toBe(200)
    // with two owners, the first one may step down
    expect((await patch(owner.token, id('owner'), 'recruiter')).status).toBe(200)
  })

  it('lets an owner remove a member, who then loses access', async () => {
    const { owner, viewer, recruiter, org } = await teamWithRoles()
    const members = (await request(app).get(`/api/v1/orgs/${org._id}`).set(bearer(owner.token))).body.members
    const id = (role) => members.find((m) => m.role === role).membershipId
    const remove = (token, membershipId) =>
      request(app).delete(`/api/v1/orgs/${org._id}/memberships/${membershipId}`).set(bearer(token))

    expect((await remove(recruiter.token, id('viewer'))).status).toBe(403)
    expect((await remove(owner.token, id('owner'))).status).toBe(400)
    expect((await remove(owner.token, id('viewer'))).status).toBe(200)

    const after = await request(app).get('/api/v1/jobs').set(bearer(viewer.token, org._id))
    expect(after.status).toBe(403)
    expect(after.body.code).toBe('NOT_A_MEMBER')
  })

  it('never ends up without an owner, even when two owners act at the same time', async () => {
    const { owner, recruiter, org } = await teamWithRoles()
    const members = (await request(app).get(`/api/v1/orgs/${org._id}`).set(bearer(owner.token))).body.members
    const ownerId = members.find((m) => m.role === 'owner').membershipId
    const recruiterId = members.find((m) => m.role === 'recruiter').membershipId
    await request(app).patch(`/api/v1/orgs/${org._id}/memberships/${recruiterId}`).set(bearer(owner.token)).send({ role: 'owner' })

    // the second owner demotes the first while the first one leaves
    const results = await Promise.all([
      request(app).patch(`/api/v1/orgs/${org._id}/memberships/${ownerId}`).set(bearer(recruiter.token)).send({ role: 'viewer' }),
      request(app).delete(`/api/v1/orgs/${org._id}/memberships/me`).set(bearer(recruiter.token)),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(await Membership.countDocuments({ organization: org._id, role: 'owner' })).toBe(1)
  })

  it('deletes a team when its only member leaves', async () => {
    const { token } = await register()
    const team = await createTeam(token, 'Solo Team')
    await request(app).post('/api/v1/jobs').set(bearer(token, team._id)).send(newJob)

    const res = await request(app).delete(`/api/v1/orgs/${team._id}/memberships/me`).set(bearer(token))
    expect(res.status).toBe(200)
    expect(res.body.msg).toMatch(/deleted/)
    expect(await Organization.exists({ _id: team._id })).toBeNull()
    expect(await Job.countDocuments({ organization: team._id })).toBe(0)
  })

  it('handles leaving: not your Personal workspace, not as the last owner', async () => {
    const { owner, recruiter, org } = await teamWithRoles()
    const leave = (token, orgId) => request(app).delete(`/api/v1/orgs/${orgId}/memberships/me`).set(bearer(token))

    const personal = await personalOrgOf(owner.user._id)
    expect((await leave(owner.token, personal._id)).status).toBe(400)
    expect((await leave(owner.token, org._id)).status).toBe(409)

    expect((await leave(recruiter.token, org._id)).status).toBe(200)
    expect((await request(app).get('/api/v1/jobs').set(bearer(recruiter.token, org._id))).status).toBe(403)
    expect(await Membership.countDocuments({ organization: org._id })).toBe(2)
    expect(await Organization.exists({ _id: org._id })).toBeTruthy()
  })
})
