import { StatusCodes } from 'http-status-codes'
import mongoose from 'mongoose'
import dayjs from 'dayjs'
import Job from '../models/Job.js'
import { BadRequestError, NotFoundError } from '../errors/index.js'
import checkPermission from '../utils/checkPermission.js'
import buildJobQuery from '../utils/buildJobQuery.js'
import { DAY, FOLLOW_UP_AFTER, GHOSTED_AFTER } from '../utils/followUp.js'

const EDITABLE_FIELDS = ['company', 'position', 'status', 'jobType', 'jobLocation']

// only copy known fields, so createdBy (or anything else) can't be sneaked in through the body
const pickFields = (body) =>
  Object.fromEntries(EDITABLE_FIELDS.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]))

const findOwnJob = async (req) => {
  const job = await Job.findById(req.params.id)
  if (!job) throw new NotFoundError(`No job with id ${req.params.id}`)

  checkPermission(req.user, job.createdBy)
  return job
}

// month buckets and the "6 months ago" window must use the same timezone
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

export const getAllJobs = async (req, res) => {
  const { filter, sort, skip, limit } = buildJobQuery(req.user.userId, req.query)

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

// a personal tracker never needs more, and it stops one script from filling the free database tier
const MAX_JOBS = 1000

export const createJob = async (req, res) => {
  if ((await Job.countDocuments({ createdBy: req.user.userId })) >= MAX_JOBS) {
    throw new BadRequestError(`You can track up to ${MAX_JOBS} applications`)
  }
  const job = await Job.create({ ...pickFields(req.body), createdBy: req.user.userId })
  res.status(StatusCodes.CREATED).json({ job })
}

export const getJob = async (req, res) => {
  const job = await findOwnJob(req)
  res.status(StatusCodes.OK).json({ job })
}

export const updateJob = async (req, res) => {
  const job = await findOwnJob(req)

  job.set(pickFields(req.body))
  await job.save()

  res.status(StatusCodes.OK).json({ job })
}

export const deleteJob = async (req, res) => {
  const job = await findOwnJob(req)
  await job.deleteOne()

  res.status(StatusCodes.OK).json({ msg: 'Job removed' })
}

export const showStats = async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.user.userId)

  const byStatus = await Job.aggregate([
    { $match: { createdBy: userId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ])

  const defaultStats = { pending: 0, interview: 0, declined: 0 }
  byStatus.forEach(({ _id, count }) => {
    defaultStats[_id] = count
  })

  const from = dayjs().subtract(5, 'month').startOf('month')
  const byMonth = await Job.aggregate([
    { $match: { createdBy: userId, createdAt: { $gte: from.toDate() } } },
    {
      $group: {
        _id: {
          year: { $year: { date: '$createdAt', timezone: TZ } },
          month: { $month: { date: '$createdAt', timezone: TZ } },
        },
        count: { $sum: 1 },
      },
    },
  ])

  // always return 6 months, including the empty ones, so the chart doesn't skip gaps
  const monthlyApplications = Array.from({ length: 6 }, (_, i) => {
    const month = from.add(i, 'month')
    const found = byMonth.find((m) => m._id.year === month.year() && m._id.month === month.month() + 1)
    return { date: month.format('MMM YYYY'), count: found?.count ?? 0 }
  })

  // median is done in JS so it doesn't depend on $median (MongoDB 7+)
  const replied = await Job.find({ createdBy: userId, repliedAt: { $exists: true } })
    .select('createdAt repliedAt')
    .lean()
  const days = replied
    .map((job) => (job.repliedAt - job.createdAt) / DAY)
    .filter((d) => d >= 0)
    .sort((a, b) => a - b)
  const mid = Math.floor(days.length / 2)
  const replyTime = days.length
    ? {
        medianDays: Math.round(days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2),
        replies: days.length,
      }
    : null

  res.status(StatusCodes.OK).json({ defaultStats, monthlyApplications, replyTime })
}

// "quiet since" = the latest of: applied, status changed, followed up.
// due: pending/interview quiet for 10-30 days. ghosted: pending quiet for 30+ days.
export const getFollowUps = async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.user.userId)
  const now = Date.now()
  const dueFrom = new Date(now - FOLLOW_UP_AFTER * DAY)
  const ghostFrom = new Date(now - GHOSTED_AFTER * DAY)

  const [result] = await Job.aggregate([
    // quietSince is never earlier than createdAt, so this cheap pre-filter can use the index
    { $match: { createdBy: userId, status: { $in: ['pending', 'interview'] }, createdAt: { $lte: dueFrom } } },
    { $addFields: { quietSince: { $max: ['$createdAt', '$statusChangedAt', '$followedUpAt'] } } },
    { $match: { quietSince: { $lte: dueFrom } } },
    {
      $facet: {
        due: [
          { $match: { quietSince: { $gt: ghostFrom } } },
          { $sort: { quietSince: 1, _id: 1 } },
          { $limit: 20 },
          { $project: { position: 1, company: 1, status: 1, createdAt: 1, quietSince: 1 } },
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
  const job = await findOwnJob(req)
  if (job.status === 'declined') throw new BadRequestError('This application is already closed')

  job.followedUpAt = new Date()
  await job.save()

  res.status(StatusCodes.OK).json({ job })
}
