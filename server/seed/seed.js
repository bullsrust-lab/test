import '../config/env.js'
import mongoose from 'mongoose'
import dayjs from 'dayjs'
import connectDB from '../config/db.js'
import User from '../models/User.js'
import Job from '../models/Job.js'
import { JOB_TYPE } from '../models/Job.js'

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

const pick = (list) => list[Math.floor(Math.random() * list.length)]

// more pending than anything else, like a real job search
const randomStatus = () => {
  const n = Math.random()
  if (n < 0.55) return 'pending'
  if (n < 0.78) return 'declined'
  return 'interview'
}

const run = async () => {
  const email = process.env.DEMO_EMAIL || 'demo@jobtrail.dev'
  const password = process.env.DEMO_PASSWORD
  if (!password) throw new Error('Set DEMO_PASSWORD in .env first')

  await connectDB(process.env.MONGO_URI)

  let demo = await User.findOne({ email })
  if (!demo) {
    demo = await User.create({ name: 'Demo User', email, password, role: 'demo' })
  }

  await Job.deleteMany({ createdBy: demo._id })

  const jobs = Array.from({ length: 75 }, () => {
    const createdAt = dayjs()
      .subtract(Math.floor(Math.random() * 240), 'day')
      .subtract(Math.floor(Math.random() * 600), 'minute')
      .toDate()
    return {
      position: pick(positions),
      company: pick(companies),
      jobLocation: pick(locations),
      jobType: pick(JOB_TYPE),
      status: randomStatus(),
      createdBy: demo._id,
      createdAt,
      updatedAt: createdAt,
    }
  })

  // insertMany keeps our createdAt instead of overwriting it with "now"
  await Job.insertMany(jobs, { timestamps: false })
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
