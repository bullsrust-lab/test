import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { performance } from 'node:perf_hooks'
import { app, bearer, createTeam, newJob, register, request, useDatabase } from './helpers.js'
import Job from '../models/Job.js'
import User from '../models/User.js'
import { seedTeam, SEED_MEMBERS } from '../scripts/seed-team.js'

useDatabase()

// "YYYY-MM" of the calendar month `offset` months from now, in UTC like the pipeline
const monthKey = (offset) => {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCHours(12, 0, 0, 0)
  d.setUTCMonth(d.getUTCMonth() + offset)
  return d.toISOString().slice(0, 7)
}
// a date safely inside that month (the 2nd, midday UTC)
const inMonth = (offset) => new Date(`${monthKey(offset)}-02T12:00:00Z`)

describe('GET /stats', () => {
  let auth
  let org
  let user

  beforeEach(async () => {
    const registered = await register()
    user = registered.user
    org = await createTeam(registered.token)
    auth = bearer(registered.token, org._id)
  })

  afterEach(() => vi.restoreAllMocks())

  const add = (company, status, createdAt) =>
    Job.create({ ...newJob, company, status, createdAt, organization: org._id, createdBy: user._id })

  it('returns exactly the specified shape, with zeros for an empty org', async () => {
    const res = await request(app).get('/api/v1/stats').set(auth)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      countsByStatus: { pending: 0, interview: 0, declined: 0 },
      applicationsPerMonth: [-5, -4, -3, -2, -1, 0].map((offset) => ({ month: monthKey(offset), count: 0 })),
      topCompanies: [],
    })
  })

  it('counts a deterministic fixture correctly', async () => {
    // this month: 3, two months ago: 2, eight months ago: 1 (outside the 6-month window)
    await add('Beta', 'pending', inMonth(0))
    await add('Alpha', 'pending', inMonth(0))
    await add('Gamma', 'interview', inMonth(0))
    await add('Beta', 'declined', inMonth(-2))
    await add('Alpha', 'interview', inMonth(-2))
    await add('Delta', 'declined', inMonth(-8))

    // another org's jobs must not leak in
    const other = await register()
    await request(app).post('/api/v1/jobs').set(bearer(other.token)).send({ ...newJob, company: 'Alpha' })

    const { body } = await request(app).get('/api/v1/stats').set(auth)

    expect(body.countsByStatus).toEqual({ pending: 2, interview: 2, declined: 2 })
    expect(body.applicationsPerMonth).toEqual([
      { month: monthKey(-5), count: 0 },
      { month: monthKey(-4), count: 0 },
      { month: monthKey(-3), count: 0 },
      { month: monthKey(-2), count: 2 },
      { month: monthKey(-1), count: 0 },
      { month: monthKey(0), count: 3 },
    ])
    // Alpha and Beta both have 2: tie broken by name. Then Delta and Gamma tie at 1, Delta wins
    expect(body.topCompanies).toEqual([
      { company: 'Alpha', count: 2 },
      { company: 'Beta', count: 2 },
      { company: 'Delta', count: 1 },
    ])
  })

  it('is one aggregation and no find()', async () => {
    const aggregate = vi.spyOn(Job, 'aggregate')
    const find = vi.spyOn(Job, 'find')
    await request(app).get('/api/v1/stats').set(auth)
    expect(aggregate).toHaveBeenCalledTimes(1)
    expect(find).not.toHaveBeenCalled()
  })

  it('returns the median days to a reply on /stats/reply-time', async () => {
    const empty = await request(app).get('/api/v1/stats/reply-time').set(auth)
    expect(empty.body).toEqual({ replyTime: null })

    const day = 864e5
    const base = Date.now() - 30 * day
    for (const replyAfter of [6, 10, 2]) {
      await Job.create({
        ...newJob,
        status: 'interview',
        organization: org._id,
        createdBy: user._id,
        createdAt: new Date(base),
        repliedAt: new Date(base + replyAfter * day),
      })
    }
    const res = await request(app).get('/api/v1/stats/reply-time').set(auth)
    expect(res.body.replyTime).toEqual({ medianDays: 6, replies: 3 })
  })
})

describe('seeded team dataset', () => {
  it('has 500 jobs over 12 months from 3 members, and /stats stays well under 200ms p95', async () => {
    const { organization, members } = await seedTeam({ password: 'northwind-seed-2026', log: () => {} })

    const jobs = await Job.find({ organization: organization._id }).lean()
    expect(jobs).toHaveLength(500)
    expect(new Set(jobs.map((j) => String(j.createdBy))).size).toBe(3)
    expect(new Set(jobs.map((j) => j.status))).toEqual(new Set(['pending', 'interview', 'declined']))
    expect(new Set(jobs.map((j) => j.jobType))).toEqual(new Set(['full-time', 'part-time', 'remote']))
    const oldest = Math.min(...jobs.map((j) => j.createdAt.getTime()))
    expect(Date.now() - oldest).toBeLessThanOrEqual(366 * 864e5)

    const owner = await User.findOne({ email: SEED_MEMBERS[0].email })
    expect(members).toHaveLength(3)
    const auth = bearer(owner.createJWT(), organization._id)

    const timings = []
    for (let i = 0; i < 60; i++) {
      const started = performance.now()
      const res = await request(app).get('/api/v1/stats').set(auth)
      timings.push(performance.now() - started)
      expect(res.status).toBe(200)
    }
    timings.sort((a, b) => a - b)
    const p95 = timings[Math.ceil(timings.length * 0.95) - 1]
    expect(p95).toBeLessThan(200)

    const { body } = await request(app).get('/api/v1/stats').set(auth)
    const total = Object.values(body.countsByStatus).reduce((a, b) => a + b, 0)
    expect(total).toBe(500)
  })

  it('replaces its own previous data and refuses databases with other users', async () => {
    await seedTeam({ password: 'northwind-seed-2026', log: () => {} })
    await seedTeam({ password: 'northwind-seed-2026', log: () => {} })
    expect(await Job.countDocuments()).toBe(500)
    expect(await User.countDocuments()).toBe(3)

    const real = await register()
    await expect(seedTeam({ password: 'northwind-seed-2026', log: () => {} })).rejects.toThrow(/didn't create/)

    // a real team with the very same name must survive --force
    const realTeam = await createTeam(real.token, 'Northwind Talent')
    await request(app).post('/api/v1/jobs').set(bearer(real.token, realTeam._id)).send(newJob)

    await seedTeam({ password: 'northwind-seed-2026', force: true, log: () => {} })
    expect(await User.countDocuments()).toBe(4)
    expect(await Job.countDocuments({ organization: realTeam._id })).toBe(1)
    expect(await Job.countDocuments()).toBe(501)
  })
})
