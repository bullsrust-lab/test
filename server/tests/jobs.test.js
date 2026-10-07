import { beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { app, bearer, daysAgo, newJob, personalOrgOf, register, request, useDatabase } from './helpers.js'
import Job from '../models/Job.js'

useDatabase()

// the v1 flows, without X-Org-Id: everything happens in the user's Personal workspace
describe('v1 regression: register -> create -> filter -> paginate -> delete', () => {
  it('still works end to end', async () => {
    const { token } = await register()
    const auth = bearer(token)

    for (const [position, status] of [
      ['React Developer', 'pending'],
      ['Data Analyst', 'interview'],
      ['React Native Developer', 'pending'],
    ]) {
      const res = await request(app).post('/api/v1/jobs').set(auth).send({ ...newJob, position, status })
      expect(res.status).toBe(201)
    }

    const filtered = await request(app).get('/api/v1/jobs?status=pending&search=react&sort=a-z').set(auth)
    expect(filtered.body.totalJobs).toBe(2)
    expect(filtered.body.jobs.map((j) => j.position)).toEqual(['React Developer', 'React Native Developer'])

    const page2 = await request(app).get('/api/v1/jobs?limit=2&page=2').set(auth)
    expect(page2.body).toMatchObject({ totalJobs: 3, numOfPages: 2 })
    expect(page2.body.jobs).toHaveLength(1)

    const id = filtered.body.jobs[0]._id
    expect((await request(app).delete(`/api/v1/jobs/${id}`).set(auth)).status).toBe(200)
    expect((await request(app).get('/api/v1/jobs').set(auth)).body.totalJobs).toBe(2)
  })
})

describe('jobs CRUD', () => {
  it('sets organization, author and author name from the server, never from the body', async () => {
    const { token, user } = await register({ name: 'Anna' })
    const fake = new mongoose.Types.ObjectId()

    const res = await request(app)
      .post('/api/v1/jobs')
      .set(bearer(token))
      .send({ ...newJob, createdBy: fake, organization: fake, createdByName: 'Someone else' })

    expect(res.status).toBe(201)
    expect(res.body.job).toMatchObject({ ...newJob, status: 'pending', jobType: 'full-time', createdByName: 'Anna' })
    expect(res.body.job.createdBy).toBe(user._id)
    expect(res.body.job.organization).toBe(String((await personalOrgOf(user._id))._id))
  })

  it('validates the body with field errors', async () => {
    const { token } = await register()
    const empty = await request(app).post('/api/v1/jobs').set(bearer(token)).send({})
    expect(empty.status).toBe(400)
    expect(empty.body.msg).toBe('Company is required, Position is required, Location is required')

    const bad = await request(app)
      .post('/api/v1/jobs')
      .set(bearer(token))
      .send({ ...newJob, status: ['interview'] })
    expect(bad.body.errors).toEqual([{ field: 'status', msg: 'Invalid status' }])
  })

  it('updates and deletes', async () => {
    const { token } = await register()
    const auth = bearer(token)
    const { body } = await request(app).post('/api/v1/jobs').set(auth).send(newJob)

    const patched = await request(app).patch(`/api/v1/jobs/${body.job._id}`).set(auth).send({ status: 'interview' })
    expect(patched.status).toBe(200)
    expect(patched.body.job).toMatchObject({ status: 'interview', company: 'Acme' })
    expect(patched.body.job.repliedAt).toBeTruthy()

    expect((await request(app).delete(`/api/v1/jobs/${body.job._id}`).set(auth)).status).toBe(200)
    expect(await Job.countDocuments()).toBe(0)
  })

  it("answers 404 for someone else's job, a missing one, and 400 for a malformed id", async () => {
    const owner = await register()
    const stranger = await register()
    const { body } = await request(app).post('/api/v1/jobs').set(bearer(owner.token)).send(newJob)
    const url = `/api/v1/jobs/${body.job._id}`
    const auth = bearer(stranger.token)

    // another user's Personal workspace is another organization: the job simply isn't there
    expect((await request(app).get(url).set(auth)).status).toBe(404)
    expect((await request(app).patch(url).set(auth).send({ status: 'declined' })).status).toBe(404)
    expect((await request(app).delete(url).set(auth)).status).toBe(404)
    expect((await request(app).get(`/api/v1/jobs/${new mongoose.Types.ObjectId()}`).set(auth)).status).toBe(404)
    expect((await request(app).delete('/api/v1/jobs/not-an-id').set(auth)).status).toBe(400)
    expect(await Job.countDocuments()).toBe(1)
  })
})

describe('GET /jobs query', () => {
  let auth

  beforeEach(async () => {
    const { token, user } = await register()
    auth = bearer(token)
    const org = await personalOrgOf(user._id)

    const jobs = [
      { position: 'Backend Developer', status: 'pending', jobType: 'remote' },
      { position: 'frontend developer', status: 'interview', jobType: 'full-time' },
      { position: 'Data Analyst', status: 'declined', jobType: 'part-time' },
      { position: 'QA Engineer', status: 'pending', jobType: 'full-time' },
      { position: 'Support (L2)', status: 'pending', jobType: 'remote' },
    ]
    for (const [i, job] of jobs.entries()) {
      await Job.create({
        ...newJob,
        ...job,
        organization: org._id,
        createdBy: user._id,
        createdAt: new Date(2026, 0, i + 1),
      })
    }

    // a job in another workspace must never show up
    const other = await register()
    await request(app).post('/api/v1/jobs').set(bearer(other.token)).send(newJob)
  })

  const get = (query = '') => request(app).get(`/api/v1/jobs${query}`).set(auth)

  it('returns only the active org with the expected shape and defaults', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(Object.keys(res.body).sort()).toEqual(['jobs', 'numOfPages', 'totalJobs'])
    expect(res.body).toMatchObject({ totalJobs: 5, numOfPages: 1 })
    expect(res.body.jobs[0].position).toBe('Support (L2)')
  })

  it('filters by status and job type, "all" means no filter', async () => {
    expect((await get('?status=pending')).body.totalJobs).toBe(3)
    expect((await get('?status=pending&jobType=remote')).body.totalJobs).toBe(2)
    expect((await get('?status=all&jobType=all')).body.totalJobs).toBe(5)
  })

  it('searches position case-insensitively with regex characters taken literally', async () => {
    expect((await get('?search=DEVELOPER')).body.totalJobs).toBe(2)
    expect((await get('?search=(L2')).body.totalJobs).toBe(1)
    expect((await get('?search=.*')).body.totalJobs).toBe(0)
    expect((await get('?search=a%00b')).status).toBe(400)
  })

  it('sorts and paginates', async () => {
    expect((await get('?sort=a-z')).body.jobs.map((j) => j.position).slice(0, 2)).toEqual(['Backend Developer', 'Data Analyst'])
    expect((await get('?sort=z-a')).body.jobs[0].position).toBe('Support (L2)')
    expect((await get('?sort=oldest')).body.jobs[0].position).toBe('Backend Developer')

    const res = await get('?limit=2&page=3')
    expect(res.body).toMatchObject({ totalJobs: 5, numOfPages: 3 })
    expect(res.body.jobs).toHaveLength(1)
  })

  it('rejects unknown filter values', async () => {
    expect((await get('?status=hired')).status).toBe(400)
    expect((await get('?sort=random')).status).toBe(400)
  })

  it('takes one value per filter, not a list', async () => {
    expect((await get('?status=pending&status=interview')).status).toBe(400)
    expect((await get('?jobType=remote&jobType=internship')).status).toBe(400)
    expect((await get('?sort=a-z&sort=latest')).status).toBe(400)
  })
})

describe('follow-ups', () => {
  let auth
  let user
  let org

  beforeEach(async () => {
    const registered = await register()
    auth = bearer(registered.token)
    user = registered.user
    org = await personalOrgOf(user._id)
  })

  const add = (position, status, fields = {}) =>
    Job.create({ ...newJob, position, status, organization: org._id, createdBy: user._id, ...fields })

  it('lists jobs that went quiet and counts the ghosted ones', async () => {
    await add('A', 'pending', { createdAt: daysAgo(3) })
    await add('B', 'pending', { createdAt: daysAgo(15) })
    await add('C', 'pending', { createdAt: daysAgo(40) })
    await add('D', 'interview', { createdAt: daysAgo(50), statusChangedAt: daysAgo(12) })
    await add('E', 'interview', { createdAt: daysAgo(20), statusChangedAt: daysAgo(2) })
    await add('F', 'declined', { createdAt: daysAgo(20) })
    await add('G', 'pending', { createdAt: daysAgo(15), followedUpAt: daysAgo(2) })

    const res = await request(app).get('/api/v1/jobs/follow-ups').set(auth)
    expect(res.status).toBe(200)
    expect(res.body.jobs.map((j) => j.position)).toEqual(['B', 'D'])
    expect(res.body).toMatchObject({ dueCount: 2, ghostedCount: 1 })
  })

  it('ignores tracking dates sent by the client', async () => {
    const fake = { followedUpAt: daysAgo(1), repliedAt: daysAgo(1), statusChangedAt: daysAgo(1) }
    const { body } = await request(app).post('/api/v1/jobs').set(auth).send({ ...newJob, ...fake })
    expect(body.job.followedUpAt).toBeUndefined()
    const patched = await request(app).patch(`/api/v1/jobs/${body.job._id}`).set(auth).send(fake)
    expect(patched.body.job.followedUpAt).toBeUndefined()
  })

  it('marks a job as followed up, with the usual checks', async () => {
    const job = await add('B', 'pending', { createdAt: daysAgo(15) })
    const declined = await add('F', 'declined', { createdAt: daysAgo(15) })
    const post = (id) => request(app).post(`/api/v1/jobs/${id}/follow-up`).set(auth)

    const res = await post(job._id)
    expect(res.status).toBe(200)
    expect((await request(app).get('/api/v1/jobs/follow-ups').set(auth)).body.dueCount).toBe(0)

    const stranger = await register()
    const foreign = await request(app).post('/api/v1/jobs').set(bearer(stranger.token)).send(newJob)
    expect((await post(foreign.body.job._id)).status).toBe(404)
    expect((await post('nope')).status).toBe(400)
    expect((await post(declined._id)).status).toBe(400)
    expect((await request(app).post(`/api/v1/jobs/${job._id}/follow-up`)).status).toBe(401)
  })
})

describe('limits', () => {
  it('caps the number of jobs per organization', async () => {
    const { token, user } = await register()
    const org = await personalOrgOf(user._id)
    await Job.insertMany(Array.from({ length: 5000 }, () => ({ ...newJob, organization: org._id, createdBy: user._id })))
    const res = await request(app).post('/api/v1/jobs').set(bearer(token)).send(newJob)
    expect(res.status).toBe(400)
  })
})
