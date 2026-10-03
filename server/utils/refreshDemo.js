import User from '../models/User.js'
import Job from '../models/Job.js'

const REFRESH_EVERY = 12 * 60 * 60 * 1000

// The demo data is seeded once, so without this every sample job would slowly turn into a
// "no reply for months" job. On demo login we move all dates forward by the time that passed
// since the last refresh, so the demo always looks like it was seeded a moment ago.
export default async function refreshDemo(demoId) {
  const now = new Date()

  // atomic claim: if several people click "demo" at once, only one of them shifts the dates
  const prev = await User.findOneAndUpdate(
    { _id: demoId, demoRefreshedAt: { $lt: new Date(now - REFRESH_EVERY) } },
    { $set: { demoRefreshedAt: now } }
  ).select('+demoRefreshedAt')
  if (!prev) return

  const shift = now - prev.demoRefreshedAt
  const move = (field) => ({
    $cond: [{ $eq: [{ $type: `$${field}` }, 'date'] }, { $add: [`$${field}`, shift] }, '$$REMOVE'],
  })

  // native driver on purpose: mongoose treats createdAt as immutable and won't take a pipeline update
  await Job.collection.updateMany({ createdBy: demoId }, [
    {
      $set: {
        createdAt: move('createdAt'),
        updatedAt: move('updatedAt'),
        statusChangedAt: move('statusChangedAt'),
        repliedAt: move('repliedAt'),
        followedUpAt: move('followedUpAt'),
      },
    },
  ])
}
