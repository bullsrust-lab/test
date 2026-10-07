// v1 -> v2: every user gets a "Personal" organization they own, and their jobs move into it.
//
// Safe to run any number of times (it runs on every deploy):
// - users who already have a membership are skipped;
// - the org and membership writes are upserts behind unique indexes (personalOf, user+organization),
//   so a second run, or two runs at once, can't create duplicates;
// - only jobs without an organization are touched, so jobs that already moved stay where they are.
// The last step is a repair pass for runs that died halfway (see ADR-002).
import User from '../models/User.js'
import Job from '../models/Job.js'
import Membership from '../models/Membership.js'
import { ensurePersonalOrg } from '../utils/orgs.js'

export const name = '001-orgs'

const moveJobs = async (user, organizationId) => {
  const { modifiedCount } = await Job.updateMany(
    { createdBy: user._id, organization: { $exists: false } },
    { $set: { organization: organizationId, createdByName: user.name } }
  )
  return modifiedCount
}

export async function up() {
  const summary = { usersProcessed: 0, orgsCreated: 0, jobsMigrated: 0, usersSkipped: 0, jobsWithoutAuthor: 0 }

  const alreadyMigrated = new Set((await Membership.distinct('user')).map(String))

  for await (const user of User.find().select('_id name').lean().cursor()) {
    if (alreadyMigrated.has(String(user._id))) {
      summary.usersSkipped++
      continue
    }

    summary.usersProcessed++
    const { organization, created } = await ensurePersonalOrg(user._id)
    if (created) summary.orgsCreated++
    summary.jobsMigrated += await moveJobs(user, organization._id)
  }

  // Repair pass. If an earlier run created the membership but died before moving the jobs, that
  // user is "already migrated" above and their jobs would stay invisible forever. So: any job that
  // still has no organization goes to its author's Personal org, whatever state the author is in.
  const authors = await Job.distinct('createdBy', { organization: { $exists: false } })
  for (const authorId of authors) {
    const user = await User.findById(authorId).select('_id name').lean()
    if (!user) {
      // the author was deleted, nobody could see these jobs in v1 either; reported, left alone
      summary.jobsWithoutAuthor += await Job.countDocuments({ createdBy: authorId, organization: { $exists: false } })
      continue
    }
    const { organization, created } = await ensurePersonalOrg(user._id)
    if (created) summary.orgsCreated++
    summary.jobsMigrated += await moveJobs(user, organization._id)
  }

  return summary
}
