import mongoose from 'mongoose'
import Membership from '../models/Membership.js'
import Organization from '../models/Organization.js'
import { BadRequestError, ForbiddenError } from '../errors/index.js'
import { adoptOrphanJobs, ensurePersonalOrg } from '../utils/orgs.js'

// Which organization a request acts in: the X-Org-Id header, or the user's Personal workspace
// when there is none. The result (req.org) is the only thing job queries and role checks look at.
const orgContext = async (req, res, next) => {
  const header = req.get('x-org-id')

  if (header) {
    if (!mongoose.isValidObjectId(header)) throw new BadRequestError('X-Org-Id is not a valid id')

    const membership = await Membership.findOne({ user: req.user.userId, organization: header })
      .populate('organization', 'name slug personalOf')
      .lean()
    // same answer whether the org doesn't exist or you're just not in it
    if (!membership || !membership.organization) {
      throw new ForbiddenError("You're not a member of this organization", 'NOT_A_MEMBER')
    }

    req.org = toContext(membership.organization, membership.role)
    return next()
  }

  // the common case is a plain read; nothing is written on the read path
  let organization = await Organization.findOne({ personalOf: req.user.userId }).select('name slug personalOf').lean()
  if (!organization) {
    // users created before v2 (or a half-finished registration) get their workspace on the spot,
    // together with any jobs they already have
    ;({ organization } = await ensurePersonalOrg(req.user.userId))
    await adoptOrphanJobs(req.user.userId, organization._id)
  }
  req.org = toContext(organization, 'owner')
  next()
}

const toContext = (organization, role) => ({
  id: organization._id,
  name: organization.name,
  slug: organization.slug,
  personal: Boolean(organization.personalOf),
  role,
})

// route-level check: may this role change anything in the active org at all?
export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.org.role)) {
      throw new ForbiddenError(`Your role (${req.org.role}) can't do this in ${req.org.name}`)
    }
    next()
  }

export default orgContext
