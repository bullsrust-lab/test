import { beforeEach, describe, expect, it } from 'vitest'
import { app, bearer, newJob, request, teamWithRoles, useDatabase } from './helpers.js'
import Job from '../models/Job.js'

useDatabase()

describe('role enforcement on job writes', () => {
  let team
  let jobId

  beforeEach(async () => {
    team = await teamWithRoles()
    const res = await request(app).post('/api/v1/jobs').set(bearer(team.owner.token, team.org._id)).send(newJob)
    jobId = res.body.job._id
  })

  const as = (member) => bearer(team[member].token, team.org._id)

  it('gives a viewer 403 on create, patch, delete and follow-up', async () => {
    const create = await request(app).post('/api/v1/jobs').set(as('viewer')).send(newJob)
    const patch = await request(app).patch(`/api/v1/jobs/${jobId}`).set(as('viewer')).send({ status: 'declined' })
    const remove = await request(app).delete(`/api/v1/jobs/${jobId}`).set(as('viewer'))
    const followUp = await request(app).post(`/api/v1/jobs/${jobId}/follow-up`).set(as('viewer'))

    expect([create.status, patch.status, remove.status, followUp.status]).toEqual([403, 403, 403, 403])
    expect(create.body.msg).toMatch(/viewer/)
    const job = await Job.findById(jobId)
    expect(job.status).toBe('pending')
    expect(await Job.countDocuments()).toBe(1)
  })

  it('lets a viewer read everything in the org', async () => {
    expect((await request(app).get('/api/v1/jobs').set(as('viewer'))).body.totalJobs).toBe(1)
    expect((await request(app).get(`/api/v1/jobs/${jobId}`).set(as('viewer'))).status).toBe(200)
    expect((await request(app).get('/api/v1/stats').set(as('viewer'))).status).toBe(200)
  })

  it.each(['owner', 'recruiter'])('lets the %s create, patch and delete', async (member) => {
    const created = await request(app).post('/api/v1/jobs').set(as(member)).send({ ...newJob, position: 'Mine' })
    expect(created.status).toBe(201)

    // permissions come from the org role, not authorship: both can edit the owner's job too
    const patch = await request(app).patch(`/api/v1/jobs/${jobId}`).set(as(member)).send({ status: 'interview' })
    expect(patch.status).toBe(200)

    expect((await request(app).delete(`/api/v1/jobs/${created.body.job._id}`).set(as(member))).status).toBe(200)
  })

  it('applies the role of the active org, not the highest role the user has anywhere', async () => {
    // the viewer owns their Personal workspace and can write there
    const own = await request(app).post('/api/v1/jobs').set(bearer(team.viewer.token)).send(newJob)
    expect(own.status).toBe(201)
    // but in the team they are still a viewer
    expect((await request(app).post('/api/v1/jobs').set(as('viewer')).send(newJob)).status).toBe(403)
  })
})
