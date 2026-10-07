import { NotFoundError } from '../errors/index.js'

// Resource-level check. In v1 it compared job.createdBy with the user; in v2 the question is
// "does this job belong to the organization you're acting in?". Whether your role may write at
// all is decided before this, by requireRole on the route.
// A job from another organization answers like a missing one, so ids from other teams can't be
// probed with 403 vs 404.
const checkPermission = (org, job) => {
  if (!job || !job.organization?.equals(org.id)) {
    throw new NotFoundError('No job with this id in the current organization')
  }
}

export default checkPermission
