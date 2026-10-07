// npm run seed:team -- creates the perf dataset: one team, 3 members, 500 jobs over 12 months.
//
// Points at SEED_URL, never at MONGO_URI by accident. What it does with existing data:
// - it only ever touches what it created itself (the org slug and the @seed.jobtrail.dev users),
//   so re-running replaces the previous seed instead of piling up duplicates;
// - if the database has anything else in it (real users), it refuses to run unless you pass --force,
//   and even then it leaves that data alone.
// Wiping the whole database or appending blindly were the alternatives; see README for why not.
import '../config/env.js'
import mongoose from 'mongoose'
import connectDB from '../config/db.js'
import User from '../models/User.js'
import Job from '../models/Job.js'
import Organization from '../models/Organization.js'
import Membership from '../models/Membership.js'
import Invitation from '../models/Invitation.js'
import { DAY } from '../utils/followUp.js'
import { createOrganization, ensurePersonalOrg } from '../utils/orgs.js'

export const SEED_DOMAIN = 'seed.jobtrail.dev'
export const SEED_ORG_NAME = 'Northwind Talent'
const JOBS = 500

// owner + two recruiters; a viewer can't add jobs, so the 500 jobs are spread over the three writers
export const SEED_MEMBERS = [
  { name: 'Olivia Grant', email: `olivia@${SEED_DOMAIN}`, role: 'owner', share: 0.3 },
  { name: 'Ravi Patel', email: `ravi@${SEED_DOMAIN}`, role: 'recruiter', share: 0.4 },
  { name: 'Mei Chen', email: `mei@${SEED_DOMAIN}`, role: 'recruiter', share: 0.3 },
]

const positions = [
  'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'React Developer', 'Node.js Engineer',
  'Data Analyst', 'QA Engineer', 'DevOps Engineer', 'Product Designer', 'IT Support Analyst',
  'Software Engineer', 'Mobile Developer', 'Technical Support Engineer', 'Platform Engineer', 'Junior Developer',
]
const companies = [
  'Aviva', 'Lotus Cars', 'Norfolk County Council', 'Brightside', 'Halo Studio', 'Mosaic Digital', 'Kingfisher Labs',
  'Anglia Software', 'Greenhouse Web', 'Northwind Systems', 'Coastline Media', 'Fenland Tech', 'Parkside Agency',
  'Bluebell Health', 'Orbit Logistics', 'Riverside Bank', 'Copper Kettle Games', 'Harbour Analytics',
]
const locations = ['Norwich', 'Cambridge', 'London', 'Ipswich', 'Brighton', 'Remote (UK)', 'Manchester', 'Leeds']

// seeded PRNG (mulberry32): the same dataset every run, so perf numbers are comparable
let state = 500_2026
const random = () => {
  state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (list) => list[Math.floor(random() * list.length)]
const weighted = (entries) => {
  let n = random()
  for (const [value, weight] of entries) {
    if ((n -= weight) < 0) return value
  }
  return entries.at(-1)[0]
}

// a team ramps up over the year: more applications in recent months than a year ago
const ageInDays = () => 365 * (1 - Math.sqrt(random()))

const statusFor = (age) =>
  age < 14
    ? weighted([['pending', 0.8], ['interview', 0.15], ['declined', 0.05]])
    : weighted([['pending', 0.35], ['interview', 0.25], ['declined', 0.4]])

const jobTypeFor = () => weighted([['full-time', 0.55], ['remote', 0.25], ['part-time', 0.2]])

const buildJob = (organizationId, author, now) => {
  const age = ageInDays()
  const createdAt = new Date(now - age * DAY)
  const status = statusFor(age)
  const job = {
    position: pick(positions),
    company: pick(companies),
    jobLocation: pick(locations),
    jobType: jobTypeFor(),
    status,
    organization: organizationId,
    createdBy: author._id,
    createdByName: author.name,
    createdAt,
    updatedAt: createdAt,
  }
  if (status !== 'pending') {
    job.repliedAt = new Date(createdAt.getTime() + Math.min(age * 0.9, 2 + random() ** 2 * 20) * DAY)
    job.statusChangedAt = job.repliedAt
    job.updatedAt = job.repliedAt
  }
  return job
}

const removePreviousSeed = async () => {
  const users = await User.find({ email: new RegExp(`@${SEED_DOMAIN.replace(/\./g, '\\.')}$`) }).select('_id')
  const userIds = users.map((u) => u._id)
  const orgIds = (
    await Organization.find({ $or: [{ name: SEED_ORG_NAME, slug: /^northwind-talent(-\d+)?$/ }, { personalOf: { $in: userIds } }] }).select('_id')
  ).map((o) => o._id)

  await Promise.all([
    Job.deleteMany({ organization: { $in: orgIds } }),
    Membership.deleteMany({ $or: [{ organization: { $in: orgIds } }, { user: { $in: userIds } }] }),
    Invitation.deleteMany({ organization: { $in: orgIds } }),
  ])
  await Organization.deleteMany({ _id: { $in: orgIds } })
  await User.deleteMany({ _id: { $in: userIds } })
  return { users: userIds.length, orgs: orgIds.length }
}

export async function seedTeam({ force = false, password, log = console.log } = {}) {
  const foreignUsers = await User.countDocuments({ email: { $not: new RegExp(`@${SEED_DOMAIN.replace(/\./g, '\\.')}$`) } })
  if (foreignUsers > 0 && !force) {
    throw new Error(
      `The target database already has ${foreignUsers} user(s) the seed didn't create. ` +
        'Point SEED_URL at a dev database, or pass --force to add the seed next to that data.'
    )
  }

  const removed = await removePreviousSeed()
  if (removed.users) log(`Removed the previous seed (${removed.users} users, ${removed.orgs} orgs)`)

  const members = []
  for (const member of SEED_MEMBERS) {
    const user = await User.create({ name: member.name, email: member.email, password })
    await ensurePersonalOrg(user._id)
    members.push({ ...member, user })
  }

  const owner = members.find((m) => m.role === 'owner')
  const { organization } = await createOrganization(SEED_ORG_NAME, owner.user._id)
  await Membership.insertMany(
    members.filter((m) => m !== owner).map((m) => ({ user: m.user._id, organization: organization._id, role: m.role }))
  )

  const now = Date.now()
  const jobs = Array.from({ length: JOBS }, () => {
    const author = weighted(members.map((m) => [m.user, m.share]))
    return buildJob(organization._id, author, now)
  })
  // timestamps off: keep the generated createdAt instead of "now"
  await Job.insertMany(jobs, { timestamps: false })

  return { organization, members, jobs: jobs.length }
}

// run directly: npm run seed:team [-- --force]
if (process.argv[1]?.endsWith('seed-team.js')) {
  const force = process.argv.includes('--force')
  const url = process.env.SEED_URL
  try {
    if (!url) throw new Error('Set SEED_URL to the database you want to seed (not production)')
    if (url === process.env.MONGO_URI && !force) {
      throw new Error('SEED_URL is the same as MONGO_URI (the app database). Use a dev database, or --force.')
    }
    const isLocal = /localhost|127\.0\.0\.1/.test(url)
    const password = process.env.SEED_PASSWORD || (isLocal ? 'northwind-seed-2026' : undefined)
    if (!password) throw new Error('Set SEED_PASSWORD for a non-local database')

    await connectDB(url)
    await Promise.all([Organization.createIndexes(), Membership.createIndexes(), Job.createIndexes()])
    const { organization, members, jobs } = await seedTeam({ force, password })

    console.log(`\nSeeded "${organization.name}" (${organization._id}) with ${jobs} jobs`)
    for (const m of members) console.log(`  ${m.role.padEnd(10)} ${m.email}`)
    console.log(`  password: ${process.env.SEED_PASSWORD ? '(from SEED_PASSWORD)' : password}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}
