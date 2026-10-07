import { beforeEach, describe, expect, it } from 'vitest'
import { app, bearer, newJob, PASSWORD, personalOrgOf, request, useDatabase } from './helpers.js'
import { up } from '../migrations/001-orgs.js'
import { runMigrations } from '../migrations/run.js'
import Job from '../models/Job.js'
import Membership from '../models/Membership.js'
import Organization from '../models/Organization.js'
import User from '../models/User.js'
import { ensurePersonalOrg } from '../utils/orgs.js'

useDatabase()

// v1 data: users without any organization, jobs with only createdBy.
// Inserted through the driver because the v2 schema would refuse jobs without an organization.
const legacyJobs = (user, count) =>
  Job.collection.insertMany(
    Array.from({ length: count }, (_, i) => ({
      ...newJob,
      position: `Job ${i}`,
      status: 'pending',
      jobType: 'full-time',
      createdBy: user._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  )

const snapshot = async () => ({
  orgs: await Organization.find().sort({ _id: 1 }).lean(),
  memberships: await Membership.find().sort({ _id: 1 }).lean(),
  jobs: (await Job.find().sort({ _id: 1 }).lean()).map((j) => [String(j._id), String(j.organization), j.createdByName]),
})

describe('001-orgs migration', () => {
  let anna
  let ben
  let carla

  beforeEach(async () => {
    anna = await User.create({ name: 'Anna', email: 'anna@test.com', password: PASSWORD })
    ben = await User.create({ name: 'Ben', email: 'ben@test.com', password: PASSWORD })
    await legacyJobs(anna, 3)
    await legacyJobs(ben, 2)

    // Carla signed up after v2 shipped: already has her workspace and a job in it
    carla = await User.create({ name: 'Carla', email: 'carla@test.com', password: PASSWORD })
    const { organization } = await ensurePersonalOrg(carla._id)
    await Job.create({ ...newJob, organization: organization._id, createdBy: carla._id, createdByName: 'Carla' })
  })

  it('gives every legacy user a Personal org and moves their jobs into it', async () => {
    const summary = await up()
    expect(summary).toEqual({ usersProcessed: 2, orgsCreated: 2, jobsMigrated: 5, usersSkipped: 1, jobsWithoutAuthor: 0 })

    for (const [user, count] of [
      [anna, 3],
      [ben, 2],
    ]) {
      const org = await personalOrgOf(user._id)
      expect(org.name).toBe('Personal')
      expect(await Membership.findOne({ user: user._id, organization: org._id })).toMatchObject({ role: 'owner' })
      const jobs = await Job.find({ createdBy: user._id }).lean()
      expect(jobs).toHaveLength(count)
      expect(jobs.every((j) => String(j.organization) === String(org._id) && j.createdByName === user.name)).toBe(true)
    }
  })

  it('is idempotent: a second run changes nothing', async () => {
    await up()
    const before = await snapshot()

    const second = await up()
    expect(second).toEqual({ usersProcessed: 0, orgsCreated: 0, jobsMigrated: 0, usersSkipped: 3, jobsWithoutAuthor: 0 })
    expect(await snapshot()).toEqual(before)
    expect(await Organization.countDocuments()).toBe(3)
    expect(await Membership.countDocuments()).toBe(3)
  })

  it('creates no duplicates when two runs overlap', async () => {
    await Promise.all([up(), up()])
    expect(await Organization.countDocuments({ personalOf: anna._id })).toBe(1)
    expect(await Membership.countDocuments({ user: anna._id })).toBe(1)
    expect(await Job.countDocuments({ organization: { $exists: false } })).toBe(0)
  })

  it('finishes a run that died after creating the membership but before moving the jobs', async () => {
    // the state a crash would leave: Anna has her org and membership, her jobs are still unassigned
    await ensurePersonalOrg(anna._id)

    const summary = await up()
    expect(summary.usersSkipped).toBe(2) // Anna (has a membership now) and Carla
    expect(summary.jobsMigrated).toBe(5) // Ben's 2 in the main loop, Anna's 3 in the repair pass
    expect(await Job.countDocuments({ organization: { $exists: false } })).toBe(0)
  })

  it('reports jobs whose author no longer exists and leaves them alone', async () => {
    const gone = await User.create({ name: 'Gone', email: 'gone@test.com', password: PASSWORD })
    await legacyJobs(gone, 2)
    await User.deleteOne({ _id: gone._id })

    const summary = await up()
    expect(summary.jobsWithoutAuthor).toBe(2)
    expect(await Job.countDocuments({ createdBy: gone._id, organization: { $exists: false } })).toBe(2)
  })

  it('npm run migrate prints the summary the brief asks for, and nothing to do the second time', async () => {
    const first = []
    const second = []
    await runMigrations({ log: (line) => first.push(line) })
    await runMigrations({ log: (line) => second.push(line) })

    const text = first.join('\n')
    for (const label of ['users processed', 'orgs created', 'jobs migrated', 'users already migrated (skipped)']) {
      expect(text).toContain(label)
    }
    expect(text).toMatch(/users processed\s+2/)
    expect(second.join('\n')).toMatch(/users processed\s+0/)
    expect(second.join('\n')).toMatch(/users already migrated \(skipped\)\s+3/)
  })

  it('leaves legacy users able to use the app exactly like in v1', async () => {
    await up()
    const res = await request(app).get('/api/v1/jobs').set(bearer(anna.createJWT()))
    expect(res.status).toBe(200)
    expect(res.body.totalJobs).toBe(3)
  })
})
