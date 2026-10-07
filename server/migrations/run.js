// npm run migrate. Runs every migration in order and prints what each one did.
// Exit code 0 also when there was nothing to do; a failure exits 1 so the deploy stops and the
// previous version keeps serving traffic.
import '../config/env.js'
import mongoose from 'mongoose'
import connectDB from '../config/db.js'
import Organization from '../models/Organization.js'
import Membership from '../models/Membership.js'
import Job from '../models/Job.js'
import * as orgs001 from './001-orgs.js'

const migrations = [orgs001]

const labels = {
  usersProcessed: 'users processed',
  orgsCreated: 'orgs created',
  jobsMigrated: 'jobs migrated',
  usersSkipped: 'users already migrated (skipped)',
  jobsWithoutAuthor: 'jobs whose author no longer exists (left as is)',
}

const print = (name, summary) => {
  console.log(`\n${name}`)
  for (const [key, value] of Object.entries(summary)) {
    console.log(`  ${(labels[key] ?? key).padEnd(48)} ${value}`)
  }
}

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set')
  await connectDB(process.env.MONGO_URI)

  // the unique indexes are what make the upserts safe, so they must exist before anything runs
  await Promise.all([Organization.createIndexes(), Membership.createIndexes(), Job.createIndexes()])

  for (const migration of migrations) {
    const started = Date.now()
    const summary = await migration.up()
    print(migration.name, summary)
    console.log(`  ${'took'.padEnd(48)} ${Date.now() - started} ms`)
  }
}

try {
  await run()
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
