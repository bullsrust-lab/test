import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import app from '../app.js'
import User from '../models/User.js'
import Job from '../models/Job.js'

let mongo

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret'
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

beforeEach(async () => {
  await User.deleteMany()
  await Job.deleteMany()
})

const register = (data = {}) =>
  request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Anna', email: 'anna@test.com', password: 'secret123', ...data })

const tokenFor = async (email = 'anna@test.com') => (await register({ email })).body.token

const newJob = { company: 'Acme', position: 'Frontend Developer', jobLocation: 'Norwich' }

describe('auth', () => {
  it('registers a user and returns a token', async () => {
    const res = await register()
    expect(res.status).toBe(201)
    expect(res.body.token).toBeTypeOf('string')
    expect(res.body.user).toMatchObject({ name: 'Anna', email: 'anna@test.com' })
    expect(res.body.user.password).toBeUndefined()
  })

  it('stores the password hashed', async () => {
    await register()
    const user = await User.findOne({ email: 'anna@test.com' }).select('+password')
    expect(user.password).not.toBe('secret123')
  })

  it('rejects a duplicate email', async () => {
    await register()
    const res = await register({ email: 'ANNA@test.com' })
    expect(res.status).toBe(400)
    expect(res.body.msg).toBe('Email already in use')
  })

  it('rejects missing fields', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({})
    expect(res.status).toBe(400)
    expect(res.body.msg).toBeTypeOf('string')
  })

  it('ignores role sent by the client', async () => {
    const res = await register({ role: 'demo' })
    const user = await User.findById(res.body.user._id)
    expect(user.role).toBe('user')
  })

  it('logs in with correct credentials', async () => {
    await register()
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'Anna@Test.com', password: 'secret123' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTypeOf('string')
  })

  it('returns 401 for a wrong password', async () => {
    await register()
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'anna@test.com', password: 'nope1234' })
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ msg: 'Invalid credentials' })
  })

  it('does not accept query operators as credentials', async () => {
    await register()
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: { $gt: '' }, password: { $gt: '' } })
    expect(res.status).toBe(400)
  })
})

describe('jobs auth', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/jobs')
    expect(res.status).toBe(401)
    expect(res.body.msg).toBeTypeOf('string')
  })

  it('returns 401 with a broken token', async () => {
    const res = await request(app).get('/api/v1/jobs').set('Authorization', 'Bearer abc.def.ghi')
    expect(res.status).toBe(401)
  })
})

describe('jobs CRUD', () => {
  it('creates a job owned by the token user, ignoring createdBy from the body', async () => {
    const token = await tokenFor()
    const fakeOwner = new mongoose.Types.ObjectId().toString()

    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...newJob, createdBy: fakeOwner })

    expect(res.status).toBe(201)
    expect(res.body.job).toMatchObject({ ...newJob, status: 'pending', jobType: 'full-time' })
    expect(res.body.job.createdBy).not.toBe(fakeOwner)
  })

  it('validates the job body', async () => {
    const token = await tokenFor()
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ company: 'Acme', status: 'hired' })
    expect(res.status).toBe(400)
    expect(res.body.errors.map((e) => e.field)).toEqual(
      expect.arrayContaining(['position', 'jobLocation', 'status'])
    )
  })

  it('updates and deletes own job', async () => {
    const token = await tokenFor()
    const auth = { Authorization: `Bearer ${token}` }
    const { body } = await request(app).post('/api/v1/jobs').set(auth).send(newJob)

    const patched = await request(app)
      .patch(`/api/v1/jobs/${body.job._id}`)
      .set(auth)
      .send({ status: 'interview' })
    expect(patched.status).toBe(200)
    expect(patched.body.job.status).toBe('interview')
    expect(patched.body.job.company).toBe('Acme')

    const deleted = await request(app).delete(`/api/v1/jobs/${body.job._id}`).set(auth)
    expect(deleted.status).toBe(200)
    expect(await Job.countDocuments()).toBe(0)
  })

  it("returns 403 when touching someone else's job", async () => {
    const owner = await tokenFor('owner@test.com')
    const other = await tokenFor('other@test.com')
    const { body } = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${owner}`)
      .send(newJob)

    const url = `/api/v1/jobs/${body.job._id}`
    const patch = await request(app).patch(url).set('Authorization', `Bearer ${other}`).send({ status: 'declined' })
    const del = await request(app).delete(url).set('Authorization', `Bearer ${other}`)

    expect(patch.status).toBe(403)
    expect(del.status).toBe(403)
  })

  it('returns 404 for a missing job and 400 for a malformed id', async () => {
    const token = await tokenFor()
    const auth = { Authorization: `Bearer ${token}` }
    const missing = new mongoose.Types.ObjectId()

    expect((await request(app).patch(`/api/v1/jobs/${missing}`).set(auth).send({})).status).toBe(404)
    expect((await request(app).delete(`/api/v1/jobs/${missing}`).set(auth)).status).toBe(404)
    expect((await request(app).delete('/api/v1/jobs/not-an-id').set(auth)).status).toBe(400)
  })
})

describe('GET /jobs query', () => {
  let auth

  beforeEach(async () => {
    const token = await tokenFor()
    auth = { Authorization: `Bearer ${token}` }
    const userId = (await User.findOne({ email: 'anna@test.com' }))._id

    const jobs = [
      { position: 'Backend Developer', status: 'pending', jobType: 'remote' },
      { position: 'frontend developer', status: 'interview', jobType: 'full-time' },
      { position: 'Data Analyst', status: 'declined', jobType: 'part-time' },
      { position: 'QA Engineer', status: 'pending', jobType: 'full-time' },
      { position: 'Support (L2)', status: 'pending', jobType: 'remote' },
    ]
    for (const [i, job] of jobs.entries()) {
      await Job.create({
        ...job,
        company: 'Acme',
        jobLocation: 'London',
        createdBy: userId,
        createdAt: new Date(2026, 0, i + 1),
      })
    }

    // a job from another user must never show up
    const other = await User.create({ name: 'Bob', email: 'bob@test.com', password: 'secret123' })
    await Job.create({ ...newJob, createdBy: other._id })
  })

  const get = (query = '') => request(app).get(`/api/v1/jobs${query}`).set(auth)

  it('returns only own jobs with the expected shape', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ totalJobs: 5, numOfPages: 1 })
    expect(res.body.jobs).toHaveLength(5)
    expect(res.body.jobs[0].position).toBe('Support (L2)')
  })

  it('filters by status and job type', async () => {
    expect((await get('?status=pending')).body.totalJobs).toBe(3)
    expect((await get('?status=pending&jobType=remote')).body.totalJobs).toBe(2)
    expect((await get('?status=all&jobType=all')).body.totalJobs).toBe(5)
  })

  it('searches position case-insensitively and treats regex chars literally', async () => {
    expect((await get('?search=DEVELOPER')).body.totalJobs).toBe(2)
    expect((await get('?search=(L2')).body.totalJobs).toBe(1)
    expect((await get('?search=.*')).body.totalJobs).toBe(0)
  })

  it('sorts', async () => {
    const az = (await get('?sort=a-z')).body.jobs.map((j) => j.position)
    expect(az[0]).toBe('Backend Developer')
    expect(az[1]).toBe('Data Analyst')
    expect((await get('?sort=z-a')).body.jobs[0].position).toBe('Support (L2)')
    expect((await get('?sort=oldest')).body.jobs[0].position).toBe('Backend Developer')
  })

  it('paginates', async () => {
    const res = await get('?limit=2&page=3')
    expect(res.body).toMatchObject({ totalJobs: 5, numOfPages: 3 })
    expect(res.body.jobs).toHaveLength(1)
  })

  it('rejects unknown filter values', async () => {
    expect((await get('?status=hired')).status).toBe(400)
    expect((await get('?sort=random')).status).toBe(400)
  })

  it('returns stats', async () => {
    const res = await request(app).get('/api/v1/jobs/stats').set(auth)
    expect(res.status).toBe(200)
    expect(res.body.defaultStats).toEqual({ pending: 3, interview: 1, declined: 1 })
    expect(res.body.monthlyApplications).toHaveLength(6)
  })
})

describe('users and demo', () => {
  it('returns and updates the current user', async () => {
    const token = await tokenFor()
    const auth = { Authorization: `Bearer ${token}` }

    const me = await request(app).get('/api/v1/users/me').set(auth)
    expect(me.body.user.email).toBe('anna@test.com')

    const updated = await request(app)
      .patch('/api/v1/users/me')
      .set(auth)
      .send({ name: 'Anna K', email: 'anna.k@test.com' })
    expect(updated.status).toBe(200)
    expect(updated.body.user.name).toBe('Anna K')
    expect(updated.body.token).toBeTypeOf('string')
  })

  it('keeps the demo user read-only', async () => {
    await User.create({ name: 'Demo', email: 'demo@test.com', password: 'secret123', role: 'demo' })
    const { body } = await request(app).post('/api/v1/auth/demo')
    const auth = { Authorization: `Bearer ${body.token}` }

    expect((await request(app).get('/api/v1/jobs').set(auth)).status).toBe(200)
    expect((await request(app).post('/api/v1/jobs').set(auth).send(newJob)).status).toBe(403)
    expect((await request(app).patch('/api/v1/users/me').set(auth).send({ name: 'x' })).status).toBe(403)
  })
})

describe('validation edge cases', () => {
  it('returns 400, not 500, for non-string credentials', async () => {
    await register({ password: 'secret123' })
    const login = (body) => request(app).post('/api/v1/auth/login').send(body)

    expect((await login({ email: 'anna@test.com', password: 123456 })).status).toBe(400)
    expect((await login({ email: 'anna@test.com', password: ['a'] })).status).toBe(400)
    expect((await login({ email: ['anna@test.com'], password: 'secret123' })).status).toBe(400)
    expect((await register({ email: ['x@test.com'] })).status).toBe(400)
    expect((await register({ email: 'num@test.com', password: 1234567 })).status).toBe(400)
  })

  it('rejects passwords longer than bcrypt can handle', async () => {
    const res = await register({ password: 'й'.repeat(40) })
    expect(res.status).toBe(400)
  })

  it('says "is required" for missing job fields', async () => {
    const token = await tokenFor()
    const res = await request(app).post('/api/v1/jobs').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(400)
    expect(res.body.msg).toBe('Company is required, Position is required, Location is required')
  })

  it('rejects arrays in enum fields', async () => {
    const token = await tokenFor()
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...newJob, status: ['interview'] })
    expect(res.status).toBe(400)
    expect(res.body.msg).toBe('Invalid status')
  })

  it('treats a token of a deleted user as an invalid session', async () => {
    const { body } = await register()
    await User.deleteMany()
    const res = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${body.token}`)
    expect(res.status).toBe(401)
  })
})

const daysAgo = (n) => new Date(Date.now() - n * 864e5)

describe('follow-ups', () => {
  let auth
  let userId

  beforeEach(async () => {
    const token = await tokenFor()
    auth = { Authorization: `Bearer ${token}` }
    userId = (await User.findOne({ email: 'anna@test.com' }))._id
  })

  const add = (position, status, fields = {}) =>
    Job.create({ ...newJob, position, status, createdBy: userId, ...fields })

  it('lists jobs that went quiet and counts the ghosted ones', async () => {
    await add('A', 'pending', { createdAt: daysAgo(3) })
    await add('B', 'pending', { createdAt: daysAgo(15) })
    await add('C', 'pending', { createdAt: daysAgo(40) })
    await add('D', 'interview', { createdAt: daysAgo(50), statusChangedAt: daysAgo(12) })
    await add('E', 'interview', { createdAt: daysAgo(20), statusChangedAt: daysAgo(2) })
    await add('F', 'declined', { createdAt: daysAgo(20) })
    await add('G', 'pending', { createdAt: daysAgo(15), followedUpAt: daysAgo(2) })
    const other = await User.create({ name: 'Bob', email: 'bob@test.com', password: 'secret123' })
    await Job.create({ ...newJob, position: 'H', createdBy: other._id, createdAt: daysAgo(15) })

    const res = await request(app).get('/api/v1/jobs/follow-ups').set(auth)
    expect(res.status).toBe(200)
    expect(res.body.jobs.map((j) => j.position)).toEqual(['B', 'D'])
    expect(res.body.dueCount).toBe(2)
    expect(res.body.ghostedCount).toBe(1)
  })

  it('records when a job first got a reply', async () => {
    const { body } = await request(app).post('/api/v1/jobs').set(auth).send(newJob)
    const url = `/api/v1/jobs/${body.job._id}`
    expect(body.job.statusChangedAt).toBeUndefined()

    const renamed = await request(app).patch(url).set(auth).send({ company: 'Other' })
    expect(renamed.body.job.statusChangedAt).toBeUndefined()

    const interview = await request(app).patch(url).set(auth).send({ status: 'interview' })
    expect(interview.body.job.repliedAt).toBeTruthy()
    const repliedAt = interview.body.job.repliedAt

    const declined = await request(app).patch(url).set(auth).send({ status: 'declined' })
    expect(declined.body.job.repliedAt).toBe(repliedAt)
    expect(declined.body.job.statusChangedAt).toBeTruthy()
  })

  it('ignores tracking dates sent by the client', async () => {
    const fake = { followedUpAt: daysAgo(1), repliedAt: daysAgo(1), statusChangedAt: daysAgo(1) }
    const { body } = await request(app).post('/api/v1/jobs').set(auth).send({ ...newJob, ...fake })
    expect(body.job.followedUpAt).toBeUndefined()
    expect(body.job.repliedAt).toBeUndefined()

    const patched = await request(app).patch(`/api/v1/jobs/${body.job._id}`).set(auth).send(fake)
    expect(patched.body.job.followedUpAt).toBeUndefined()
  })

  it('marks a job as followed up', async () => {
    const job = await add('B', 'pending', { createdAt: daysAgo(15) })
    const res = await request(app).post(`/api/v1/jobs/${job._id}/follow-up`).set(auth)
    expect(res.status).toBe(200)
    expect(res.body.job.followedUpAt).toBeTruthy()

    const list = await request(app).get('/api/v1/jobs/follow-ups').set(auth)
    expect(list.body.dueCount).toBe(0)
  })

  it('checks ownership, ids and status on follow-up', async () => {
    const declined = await add('F', 'declined', { createdAt: daysAgo(15) })
    const other = await User.create({ name: 'Bob', email: 'bob@test.com', password: 'secret123' })
    const foreign = await Job.create({ ...newJob, createdBy: other._id })
    const post = (id) => request(app).post(`/api/v1/jobs/${id}/follow-up`).set(auth)

    expect((await post(foreign._id)).status).toBe(403)
    expect((await post('nope')).status).toBe(400)
    expect((await post(new mongoose.Types.ObjectId())).status).toBe(404)
    expect((await post(declined._id)).status).toBe(400)
    expect((await request(app).post(`/api/v1/jobs/${declined._id}/follow-up`)).status).toBe(401)
  })

  it('returns the median time to a reply', async () => {
    const empty = await request(app).get('/api/v1/jobs/stats').set(auth)
    expect(empty.body.replyTime).toBeNull()

    await add('X', 'interview', { createdAt: daysAgo(20), repliedAt: daysAgo(14) })
    await add('Y', 'declined', { createdAt: daysAgo(20), repliedAt: daysAgo(10) })
    const res = await request(app).get('/api/v1/jobs/stats').set(auth)
    expect(res.body.replyTime).toEqual({ medianDays: 8, replies: 2 })
  })
})

describe('demo refresh', () => {
  it('moves demo dates forward once per 12 hours and leaves other users alone', async () => {
    const demo = await User.create({
      name: 'Demo',
      email: 'demo@test.com',
      password: 'secret123',
      role: 'demo',
      demoRefreshedAt: daysAgo(20),
    })
    const job = await Job.create({ ...newJob, createdBy: demo._id, createdAt: daysAgo(25) })
    const other = await User.create({ name: 'Bob', email: 'bob@test.com', password: 'secret123' })
    const otherJob = await Job.create({ ...newJob, createdBy: other._id, createdAt: daysAgo(25) })

    await request(app).post('/api/v1/auth/demo')
    const ageInDays = async (id) => (Date.now() - (await Job.findById(id)).createdAt) / 864e5

    expect(await ageInDays(job._id)).toBeCloseTo(5, 1)
    expect(await ageInDays(otherJob._id)).toBeCloseTo(25, 1)

    await request(app).post('/api/v1/auth/demo')
    expect(await ageInDays(job._id)).toBeCloseTo(5, 1)
  })
})

it('returns JSON 404 for unknown api routes', async () => {
  const res = await request(app).get('/api/v1/nope')
  expect(res.status).toBe(404)
  expect(res.body).toEqual({ msg: 'Route not found' })
})
