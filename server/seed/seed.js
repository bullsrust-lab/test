import '../config/env.js'
import mongoose from 'mongoose'
import connectDB from '../config/db.js'
import User from '../models/User.js'
import Job from '../models/Job.js'
import { JOB_TYPE } from '../models/Job.js'
import { DAY } from '../utils/followUp.js'

const positions = [
  'Junior Frontend Developer',
  'React Developer',
  'Junior Full Stack Developer',
  'Node.js Developer',
  'Web Developer',
  'Graduate Software Engineer',
  'JavaScript Developer',
  'IT Support Analyst',
  'Junior Backend Developer',
  'Software Engineer I',
  'UI Developer',
  'Technical Support Engineer',
  'Junior QA Engineer',
  'Frontend Engineer (Vue/React)',
  'Associate Developer',
]

const companies = [
  'Aviva',
  'Lotus Cars',
  'Norfolk County Council',
  'Brightside',
  'Halo Studio',
  'Mosaic Digital',
  'Kingfisher Labs',
  'Anglia Software',
  'Greenhouse Web',
  'Northwind Systems',
  'Coastline Media',
  'Fenland Tech',
  'Parkside Agency',
  'Bluebell Health',
  'Orbit Logistics',
]

const locations = ['Norwich', 'Lowestoft', 'Ipswich', 'Cambridge', 'London', 'Brighton', 'Remote (UK)', 'Great Yarmouth']

// seeded PRNG (mulberry32), so the demo looks the same every time it's re-seeded
let state = 20261003
const random = () => {
  state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (list) => list[Math.floor(random() * list.length)]
const between = (min, max) => min + random() * (max - min)

// older applications are more likely to have an answer, fresh ones are mostly still pending
const statusFor = (age) => {
  const n = random()
  if (age < 10) return n < 0.85 ? 'pending' : n < 0.95 ? 'interview' : 'declined'
  if (age < 30) return n < 0.55 ? 'pending' : n < 0.8 ? 'declined' : 'interview'
  return n < 0.25 ? 'pending' : n < 0.72 ? 'declined' : 'interview'
}

// ages keep half a day away from the 10/30 day thresholds,
// so a few hours between seeding and looking at the demo don't move jobs between groups
const ages = [
  ...Array.from({ length: 6 }, () => between(0.2, 9.5)),
  ...Array.from({ length: 14 }, () => between(10.5, 29.5)),
  ...Array.from({ length: 55 }, () => between(31, 240)),
]

const buildJob = (age, createdBy, now) => {
  const createdAt = new Date(now - age * DAY)
  const status = statusFor(age)
  const job = {
    position: pick(positions),
    company: pick(companies),
    jobLocation: pick(locations),
    jobType: pick(JOB_TYPE),
    status,
    createdBy,
    createdAt,
    updatedAt: createdAt,
  }

  if (status !== 'pending') {
    // most companies answer within a week or two, a few take much longer
    const replyAfter = Math.min(age * 0.9, 2 + random() ** 2 * 19)
    job.repliedAt = new Date(createdAt.getTime() + replyAfter * DAY)
    job.statusChangedAt = job.repliedAt
    if (status === 'declined' && random() < 0.3) {
      // rejected after an interview
      const later = job.repliedAt.getTime() + between(4, 12) * DAY
      job.statusChangedAt = new Date(Math.min(later, now - 60 * 60 * 1000))
    }
    job.updatedAt = job.statusChangedAt
  } else if (age > 12 && age < 29 && random() < 0.25) {
    job.followedUpAt = new Date(now - between(1, 6) * DAY)
    job.updatedAt = job.followedUpAt
  }

  return job
}

const run = async () => {
  const email = process.env.DEMO_EMAIL || 'demo@jobtrail.dev'
  const password = process.env.DEMO_PASSWORD
  if (!password) throw new Error('Set DEMO_PASSWORD in .env first')

  await connectDB(process.env.MONGO_URI)

  let demo = await User.findOne({ email })
  if (demo && demo.role !== 'demo') {
    throw new Error(`${email} belongs to a regular account, set a different DEMO_EMAIL`)
  }
  if (!demo) {
    demo = await User.create({ name: 'Demo User', email, password, role: 'demo' })
  }

  await Job.deleteMany({ createdBy: demo._id })

  const now = Date.now()
  const jobs = ages.map((age) => buildJob(age, demo._id, now))

  // insertMany with timestamps off keeps our createdAt instead of overwriting it with "now"
  await Job.insertMany(jobs, { timestamps: false })
  await User.updateOne({ _id: demo._id }, { $set: { demoRefreshedAt: new Date(now) } })
  console.log(`Seeded ${jobs.length} jobs for ${email}`)
}

try {
  await run()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
