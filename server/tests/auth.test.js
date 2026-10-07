import { describe, expect, it } from 'vitest'
import jwt from 'jsonwebtoken'
import { app, bearer, daysAgo, newJob, PASSWORD, personalOrgOf, register, request, useDatabase } from './helpers.js'
import User from '../models/User.js'
import Job from '../models/Job.js'
import Membership from '../models/Membership.js'

useDatabase()

const login = (body) => request(app).post('/api/v1/auth/login').send(body)

describe('register', () => {
  it('creates the account with a Personal workspace it owns', async () => {
    const { token, user } = await register({ name: 'Anna', email: 'anna@test.com' })
    expect(token).toBeTypeOf('string')
    expect(user).toMatchObject({ name: 'Anna', email: 'anna@test.com' })
    expect(user.password).toBeUndefined()

    const org = await personalOrgOf(user._id)
    expect(org).toMatchObject({ name: 'Personal', slug: `personal-${user._id}` })
    const membership = await Membership.findOne({ user: user._id, organization: org._id })
    expect(membership.role).toBe('owner')
  })

  it('stores the password hashed', async () => {
    await register({ email: 'anna@test.com' })
    const user = await User.findOne({ email: 'anna@test.com' }).select('+password')
    expect(user.password).not.toBe(PASSWORD)
  })

  it('rejects a duplicate email regardless of case', async () => {
    await register({ email: 'anna@test.com' })
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Anna', email: 'ANNA@test.com', password: PASSWORD })
    expect(res.status).toBe(400)
    expect(res.body.msg).toBe('Email already in use')
  })

  it('rejects missing fields, short and common passwords', async () => {
    const post = (body) => request(app).post('/api/v1/auth/register').send(body)
    expect((await post({})).status).toBe(400)
    expect((await post({ name: 'A', email: 'a@test.com', password: 'short12' })).status).toBe(400)
    const common = await post({ name: 'Anna', email: 'a@test.com', password: 'Password123' })
    expect(common.status).toBe(400)
    expect(common.body.msg).toMatch(/too common/)
    expect((await post({ name: 'Anna', email: 'a@test.com', password: 'й'.repeat(40) })).status).toBe(400)
  })

  it('ignores a role sent by the client', async () => {
    const { user } = await register({ role: 'demo' })
    expect((await User.findById(user._id)).role).toBe('user')
  })
})

describe('login', () => {
  it('logs in with any email case', async () => {
    await register({ email: 'anna@test.com' })
    const res = await login({ email: 'Anna@Test.com', password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTypeOf('string')
  })

  it('answers 401 with one message for a wrong password or unknown email', async () => {
    await register({ email: 'anna@test.com' })
    expect((await login({ email: 'anna@test.com', password: 'nope12345' })).body).toEqual({ msg: 'Invalid credentials' })
    expect((await login({ email: 'nobody@test.com', password: 'nope12345' })).status).toBe(401)
  })

  it('answers 400, not 500, for non-string or operator credentials', async () => {
    await register({ email: 'anna@test.com' })
    expect((await login({ email: 'anna@test.com', password: 123456 })).status).toBe(400)
    expect((await login({ email: ['anna@test.com'], password: PASSWORD })).status).toBe(400)
    expect((await login({ email: { $gt: '' }, password: { $gt: '' } })).status).toBe(400)
  })
})

describe('tokens', () => {
  it('rejects missing, broken and forged tokens', async () => {
    expect((await request(app).get('/api/v1/jobs')).status).toBe(401)
    expect((await request(app).get('/api/v1/jobs').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401)
    const forged = jwt.sign({ userId: { $ne: null } }, process.env.JWT_SECRET)
    expect((await request(app).get('/api/v1/jobs').set(bearer(forged))).status).toBe(401)
  })

  it('treats a token of a deleted user as an invalid session', async () => {
    const { token } = await register()
    await User.deleteMany()
    expect((await request(app).get('/api/v1/users/me').set(bearer(token))).status).toBe(401)
  })
})

describe('current user', () => {
  it('returns and updates the profile, and renames the author on their jobs', async () => {
    const { token } = await register({ name: 'Anna', email: 'anna@test.com' })
    await request(app).post('/api/v1/jobs').set(bearer(token)).send(newJob)

    const updated = await request(app)
      .patch('/api/v1/users/me')
      .set(bearer(token))
      .send({ name: 'Anna Karr', email: 'anna.k@test.com' })
    expect(updated.status).toBe(200)
    expect(updated.body.user.name).toBe('Anna Karr')
    expect(updated.body.token).toBeTypeOf('string')

    const job = await Job.findOne()
    expect(job.createdByName).toBe('Anna Karr')
  })
})

describe('demo account', () => {
  it('is read-only everywhere', async () => {
    await User.create({ name: 'Demo', email: 'demo@test.com', password: PASSWORD, role: 'demo' })
    const { body } = await request(app).post('/api/v1/auth/demo')
    const auth = bearer(body.token)

    expect((await request(app).get('/api/v1/jobs').set(auth)).status).toBe(200)
    expect((await request(app).post('/api/v1/jobs').set(auth).send(newJob)).status).toBe(403)
    expect((await request(app).patch('/api/v1/users/me').set(auth).send({ name: 'x' })).status).toBe(403)
    expect((await request(app).post('/api/v1/orgs').set(auth).send({ name: 'Demo team' })).status).toBe(403)
  })

  it('moves demo dates forward once per 12 hours and leaves other users alone', async () => {
    const demo = await User.create({
      name: 'Demo',
      email: 'demo@test.com',
      password: PASSWORD,
      role: 'demo',
      demoRefreshedAt: daysAgo(20),
    })
    const other = await register()
    const demoOrg = (await request(app).get('/api/v1/orgs').set(bearer(demo.createJWT()))).body.organizations[0]
    const otherOrg = await personalOrgOf(other.user._id)
    const job = await Job.create({ ...newJob, organization: demoOrg._id, createdBy: demo._id, createdAt: daysAgo(25) })
    const otherJob = await Job.create({ ...newJob, organization: otherOrg._id, createdBy: other.user._id, createdAt: daysAgo(25) })

    await request(app).post('/api/v1/auth/demo')
    const ageInDays = async (id) => (Date.now() - (await Job.findById(id)).createdAt) / 864e5
    expect(await ageInDays(job._id)).toBeCloseTo(5, 1)
    expect(await ageInDays(otherJob._id)).toBeCloseTo(25, 1)

    await request(app).post('/api/v1/auth/demo')
    expect(await ageInDays(job._id)).toBeCloseTo(5, 1)
  })
})

describe('api basics', () => {
  it('answers JSON 404 for unknown routes and keeps API responses out of the cache', async () => {
    const res = await request(app).get('/api/v1/nope')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ msg: 'Route not found' })
    expect(res.headers['cache-control']).toBe('no-store')
  })
})
