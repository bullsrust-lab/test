import { StatusCodes } from 'http-status-codes'
import mongoose from 'mongoose'
import dayjs from 'dayjs'
import Job from '../models/Job.js'
import { NotFoundError } from '../errors/index.js'
import checkPermission from '../utils/checkPermission.js'
import buildJobQuery from '../utils/buildJobQuery.js'

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

export const createJob = async (req, res) => {
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
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
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

  res.status(StatusCodes.OK).json({ defaultStats, monthlyApplications })
}
