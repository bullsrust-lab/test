// npm run bench:stats -- measures GET /api/v1/stats over HTTP against the seeded team.
// Run `npm run seed:team` first, with the same SEED_URL.
//
// Starts the real app on a random local port (same middleware chain as production: auth,
// org context, rate limits, the aggregation), sends sequential requests as the seed owner and
// prints latency percentiles plus the query plan of the pipeline.
import '../config/env.js'
import crypto from 'node:crypto'
import { performance } from 'node:perf_hooks'
import mongoose from 'mongoose'
import connectDB from '../config/db.js'
import User from '../models/User.js'
import Membership from '../models/Membership.js'
import Job from '../models/Job.js'
import { statsPipeline } from '../controllers/statsController.js'
import { SEED_MEMBERS, SEED_ORG_NAME } from './seed-team.js'

const WARMUP = 20
const RUNS = Number(process.env.BENCH_RUNS) || 300

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
const ms = (n) => `${n.toFixed(1)} ms`

const run = async () => {
  if (!process.env.SEED_URL) throw new Error('Set SEED_URL (the database you seeded with npm run seed:team)')
  // no per-request logging (it would skew the timings), and a throwaway signing secret
  process.env.NODE_ENV = 'benchmark'
  process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex')

  await connectDB(process.env.SEED_URL)
  // the team the seeded owner owns, not "any org with that name"
  const owner = await User.findOne({ email: SEED_MEMBERS[0].email })
  const memberships = owner
    ? await Membership.find({ user: owner._id, role: 'owner' }).populate('organization').lean()
    : []
  const organization = memberships.map((m) => m.organization).find((o) => o && !o.personalOf && o.name === SEED_ORG_NAME)
  if (!owner || !organization) throw new Error('No seeded team found, run npm run seed:team first')
  const jobCount = await Job.countDocuments({ organization: organization._id })

  const { default: app } = await import('../app.js')
  const server = app.listen(0)
  const { port } = server.address()
  const url = `http://127.0.0.1:${port}/api/v1/stats`
  const headers = { Authorization: `Bearer ${owner.createJWT()}`, 'X-Org-Id': String(organization._id) }

  const hit = async () => {
    const started = performance.now()
    const res = await fetch(url, { headers })
    const body = await res.json()
    const took = performance.now() - started
    if (res.status !== 200) throw new Error(`GET /stats answered ${res.status}: ${body.msg}`)
    return { took, body }
  }

  for (let i = 0; i < WARMUP; i++) await hit()
  const timings = []
  let sample
  for (let i = 0; i < RUNS; i++) {
    const { took, body } = await hit()
    timings.push(took)
    sample = body
  }
  server.close()

  const sorted = [...timings].sort((a, b) => a - b)
  const plan = await Job.aggregate(statsPipeline(organization._id)).explain('executionStats')
  const planText = JSON.stringify(plan)
  const index = planText.match(/"indexName":"([^"]+)"/)?.[1] ?? 'none (collection scan)'
  const examined = planText.match(/"totalDocsExamined":(\d+)/)?.[1]

  console.log(`GET /api/v1/stats  ${organization.name}, ${jobCount} jobs, ${SEED_MEMBERS.length} members`)
  console.log(`node ${process.version}, ${RUNS} sequential requests after ${WARMUP} warm-up\n`)
  console.log(`  min   ${ms(sorted[0])}`)
  console.log(`  p50   ${ms(percentile(sorted, 50))}`)
  console.log(`  p90   ${ms(percentile(sorted, 90))}`)
  console.log(`  p95   ${ms(percentile(sorted, 95))}   (ceiling: 200 ms)`)
  console.log(`  p99   ${ms(percentile(sorted, 99))}`)
  console.log(`  max   ${ms(sorted.at(-1))}\n`)
  console.log(`  index used: ${index}, documents examined: ${examined}`)
  console.log(`\nresponse:\n${JSON.stringify(sample, null, 2)}`)

  if (percentile(sorted, 95) >= 200) process.exitCode = 1
}

try {
  await run()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
