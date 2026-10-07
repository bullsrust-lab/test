import { StatusCodes } from 'http-status-codes'
import Job from '../models/Job.js'
import User from '../models/User.js'
import { BadRequestError } from '../errors/index.js'
import checkPermission from '../utils/checkPermission.js'
import buildJobQuery from '../utils/buildJobQuery.js'
import { DAY, FOLLOW_UP_AFTER, GHOSTED_AFTER } from '../utils/followUp.js'

const EDITABLE_FIELDS = ['company', 'position', 'status', 'jobType', 'jobLocation']

// a team pipeline never needs more, and it stops one script from filling the free database tier
const MAX_JOBS_PER_ORG = 5000

// only copy known fields, so organization, createdBy (or anything else) can't be sneaked in
const pickFields = (body) =>
  Object.fromEntries(EDITABLE_FIELDS.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]))

const findJobInOrg = async (req) => {
  const job = await Job.findById(req.params.id)
  checkPermission(req.org, job)
  return job
}

export const getAllJobs = async (req, res) => {
  const { filter, sort, skip, limit } = buildJobQuery(req.org.id, req.query)

  const [jobs, totalJobs] = await Promise.all([
    Job.find(filter).sort(sort).collation({ locale: 'en' }).skip(skip).limit(limit),
    Job.countDocuments(filter),
  ])

  res.status(StatusCodes.OK).json({
    jobs,
    totalJobs,
    numOfPages: Math.ceil(totalJobs / limit),
  })
}

export const createJob = async (req, res) => {
  if ((await Job.countDocuments({ organization: req.org.id })) >= MAX_JOBS_PER_ORG) {
    throw new BadRequestError(`An organization can track up to ${MAX_JOBS_PER_ORG} applications`)
  }

  // the name in the token can be up to a day old, the stored one is what other members will see
  const author = await User.findById(req.user.userId).select('name').lean()
  const job = await Job.create({
    ...pickFields(req.body),
    organization: req.org.id,
    createdBy: req.user.userId,
    createdByName: author?.name ?? req.user.name,
  })
  res.status(StatusCodes.CREATED).json({ job })
}

export const getJob = async (req, res) => {
  const job = await findJobInOrg(req)
  res.status(StatusCodes.OK).json({ job })
}

export const updateJob = async (req, res) => {
  const job = await findJobInOrg(req)

  job.set(pickFields(req.body))
  await job.save()

  res.status(StatusCodes.OK).json({ job })
}

export const deleteJob = async (req, res) => {
  const job = await findJobInOrg(req)
  await job.deleteOne()

  res.status(StatusCodes.OK).json({ msg: 'Job removed' })
}

// "quiet since" = the latest of: applied, status changed, followed up.
// due: pending/interview quiet for 10-30 days. ghosted: pending quiet for 30+ days.
export const getFollowUps = async (req, res) => {
  const now = Date.now()
  const dueFrom = new Date(now - FOLLOW_UP_AFTER * DAY)
  const ghostFrom = new Date(now - GHOSTED_AFTER * DAY)

  const [result] = await Job.aggregate([
    // quietSince is never earlier than createdAt, so this cheap pre-filter can use the index
    { $match: { organization: req.org.id, status: { $in: ['pending', 'interview'] }, createdAt: { $lte: dueFrom } } },
    { $addFields: { quietSince: { $max: ['$createdAt', '$statusChangedAt', '$followedUpAt'] } } },
    { $match: { quietSince: { $lte: dueFrom } } },
    {
      $facet: {
        due: [
          { $match: { quietSince: { $gt: ghostFrom } } },
          { $sort: { quietSince: 1, _id: 1 } },
          { $limit: 20 },
          { $project: { position: 1, company: 1, status: 1, createdAt: 1, quietSince: 1, createdByName: 1 } },
        ],
        dueCount: [{ $match: { quietSince: { $gt: ghostFrom } } }, { $count: 'n' }],
        ghostedCount: [{ $match: { status: 'pending', quietSince: { $lte: ghostFrom } } }, { $count: 'n' }],
      },
    },
  ])

  res.status(StatusCodes.OK).json({
    jobs: result.due,
    dueCount: result.dueCount[0]?.n ?? 0,
    ghostedCount: result.ghostedCount[0]?.n ?? 0,
  })
}

export const markFollowedUp = async (req, res) => {
  const job = await findJobInOrg(req)
  if (job.status === 'declined') throw new BadRequestError('This application is already closed')

  job.followedUpAt = new Date()
  await job.save()

  res.status(StatusCodes.OK).json({ job })
}
