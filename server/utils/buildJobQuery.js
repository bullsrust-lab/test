const SORT_OPTIONS = {
  latest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  'a-z': { position: 1 },
  'z-a': { position: -1 },
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const toPositiveInt = (value, fallback, max = Infinity) => {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, max)
}

const buildJobQuery = (organizationId, query) => {
  const { status, jobType, sort, search } = query

  const filter = { organization: organizationId }
  if (status && status !== 'all') filter.status = status
  if (jobType && jobType !== 'all') filter.jobType = jobType
  if (search?.trim()) {
    filter.position = { $regex: escapeRegex(search.trim()), $options: 'i' }
  }

  const page = toPositiveInt(query.page, 1)
  const limit = toPositiveInt(query.limit, 10, 50)

  return {
    filter,
    sort: { ...(SORT_OPTIONS[sort] || SORT_OPTIONS.latest), _id: -1 },
    page,
    limit,
    skip: (page - 1) * limit,
  }
}

export default buildJobQuery
