import { StatusCodes } from 'http-status-codes'
import Job from '../models/Job.js'
import { DAY } from '../utils/followUp.js'

const MONTHS = 6

// value of `field` in the first element of `array` whose _id equals `id`, or 0
const countFor = (array, id) => ({
  $ifNull: [{ $getField: { field: 'count', input: { $first: { $filter: { input: array, cond: { $eq: ['$$this._id', id] } } } } } }, 0],
})

// start of the current calendar month (UTC), moved `amount` months
const monthStart = (amount) => ({
  $dateAdd: { startDate: { $dateTrunc: { date: '$$NOW', unit: 'month', timezone: 'UTC' } }, unit: 'month', amount },
})

// One round trip: $match narrows to the org (index on organization + createdAt), $facet runs the
// three groupings over the same documents, $project fills the gaps (statuses and months with no
// jobs become 0) so the response always has the same shape. Months are calendar months in UTC.
export const statsPipeline = (organizationId) => [
  { $match: { organization: organizationId } },
  {
    $facet: {
      byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
      byMonth: [
        { $match: { $expr: { $gte: ['$createdAt', monthStart(-(MONTHS - 1))] } } },
        { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m', timezone: 'UTC' } }, count: { $sum: 1 } } },
      ],
      topCompanies: [
        { $group: { _id: '$company', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 3 },
        { $project: { _id: 0, company: '$_id', count: 1 } },
      ],
    },
  },
  {
    $project: {
      countsByStatus: {
        pending: countFor('$byStatus', 'pending'),
        interview: countFor('$byStatus', 'interview'),
        declined: countFor('$byStatus', 'declined'),
      },
      applicationsPerMonth: {
        $map: {
          // oldest first: 5 months ago ... this month
          input: { $range: [-(MONTHS - 1), 1] },
          as: 'offset',
          in: {
            $let: {
              vars: { month: { $dateToString: { date: monthStart('$$offset'), format: '%Y-%m', timezone: 'UTC' } } },
              in: { month: '$$month', count: countFor('$byMonth', '$$month') },
            },
          },
        },
      },
      topCompanies: 1,
    },
  },
]

export const getStats = async (req, res) => {
  const [stats] = await Job.aggregate(statsPipeline(req.org.id))
  res.status(StatusCodes.OK).json(stats)
}

// Median days between applying and the first reply. Kept out of /stats on purpose: that response
// has a fixed shape in the brief. Also a pipeline: sort the reply times, then pick the middle.
export const getReplyTime = async (req, res) => {
  const [result] = await Job.aggregate([
    { $match: { organization: req.org.id, repliedAt: { $exists: true } } },
    { $project: { days: { $divide: [{ $subtract: ['$repliedAt', '$createdAt'] }, DAY] } } },
    { $match: { days: { $gte: 0 } } },
    { $sort: { days: 1 } },
    { $group: { _id: null, days: { $push: '$days' } } },
    {
      $project: {
        _id: 0,
        replies: { $size: '$days' },
        medianDays: {
          $let: {
            vars: { n: { $size: '$days' }, mid: { $floor: { $divide: [{ $size: '$days' }, 2] } } },
            in: {
              $round: [
                {
                  $cond: [
                    { $eq: [{ $mod: ['$$n', 2] }, 1] },
                    { $arrayElemAt: ['$days', '$$mid'] },
                    { $avg: [{ $arrayElemAt: ['$days', { $subtract: ['$$mid', 1] }] }, { $arrayElemAt: ['$days', '$$mid'] }] },
                  ],
                },
                0,
              ],
            },
          },
        },
      },
    },
  ])

  res.status(StatusCodes.OK).json({ replyTime: result ?? null })
}
