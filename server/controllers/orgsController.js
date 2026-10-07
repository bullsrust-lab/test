import { StatusCodes } from 'http-status-codes'
import Membership from '../models/Membership.js'
import Invitation, { INVITE_TTL_DAYS } from '../models/Invitation.js'
import User from '../models/User.js'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors/index.js'
import { createOrganization, ensurePersonalOrg } from '../utils/orgs.js'
import { DAY } from '../utils/followUp.js'

// the membership of the signed-in user in :orgId, or 403 (same answer for "no such org")
const membershipIn = async (req) => {
  const membership = await Membership.findOne({ user: req.user.userId, organization: req.params.orgId }).populate(
    'organization'
  )
  if (!membership || !membership.organization) throw new ForbiddenError("You're not a member of this organization")
  return membership
}

const requireOwner = (membership) => {
  if (membership.role !== 'owner') throw new ForbiddenError('Only an owner can do this')
}

const countOwners = (organizationId) => Membership.countDocuments({ organization: organizationId, role: 'owner' })

// where the invitee should land. APP_URL wins when the API and the site live on different hosts
const appUrl = (req) => process.env.APP_URL || `${req.protocol}://${req.get('host')}`

export const listMyOrgs = async (req, res) => {
  await ensurePersonalOrg(req.user.userId)
  const memberships = await Membership.find({ user: req.user.userId }).populate('organization').lean()

  const organizations = memberships
    .filter((m) => m.organization)
    .map(({ organization, role }) => ({
      _id: organization._id,
      name: organization.name,
      slug: organization.slug,
      personal: Boolean(organization.personalOf),
      role,
    }))
    // Personal first, then teams by name
    .sort((a, b) => Number(b.personal) - Number(a.personal) || a.name.localeCompare(b.name))

  res.status(StatusCodes.OK).json({ organizations })
}

export const createOrg = async (req, res) => {
  const { organization, membership } = await createOrganization(req.body.name, req.user.userId)
  res.status(StatusCodes.CREATED).json({ organization, role: membership.role })
}

export const getOrg = async (req, res) => {
  const membership = await membershipIn(req)
  const { organization } = membership

  const members = await Membership.find({ organization: organization._id })
    .populate('user', 'name email')
    .sort({ createdAt: 1 })
    .lean()

  // pending invitations are owner business, other members just see who is in
  const invitations =
    membership.role === 'owner'
      ? await Invitation.find({ organization: organization._id, status: 'pending', expiresAt: { $gt: new Date() } })
          .populate('invitedBy', 'name')
          .sort({ createdAt: -1 })
          .lean()
      : []

  res.status(StatusCodes.OK).json({
    organization,
    role: membership.role,
    members: members
      .filter((m) => m.user)
      .map((m) => ({
        membershipId: m._id,
        userId: m.user._id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        joinedAt: m.createdAt,
      })),
    invitations: invitations.map((i) => ({
      _id: i._id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt,
      invitedBy: i.invitedBy?.name,
    })),
  })
}

export const createInvitation = async (req, res) => {
  const membership = await membershipIn(req)
  requireOwner(membership)
  const { organization } = membership

  if (organization.personalOf) {
    throw new BadRequestError("A Personal workspace can't be shared. Create a team and invite people there.")
  }

  const { email, role } = req.body

  const existingUser = await User.findOne({ email }).select('_id').lean()
  if (existingUser && (await Membership.exists({ user: existingUser._id, organization: organization._id }))) {
    throw new ConflictError(`${email} is already a member of ${organization.name}`)
  }

  // inviting the same address again replaces the old link instead of leaving two valid ones around
  await Invitation.updateMany(
    { organization: organization._id, email, status: 'pending' },
    { $set: { status: 'revoked' } }
  )

  const { token, tokenHash } = Invitation.generateToken()
  const invitation = await Invitation.create({
    organization: organization._id,
    email,
    role,
    tokenHash,
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * DAY),
    invitedBy: req.user.userId,
  })

  res.status(StatusCodes.CREATED).json({
    invitation,
    token,
    inviteUrl: `${appUrl(req)}/invite/${token}`,
  })
}

export const revokeInvitation = async (req, res) => {
  const membership = await membershipIn(req)
  requireOwner(membership)

  const result = await Invitation.updateOne(
    { _id: req.params.invitationId, organization: membership.organization._id, status: 'pending' },
    { $set: { status: 'revoked' } }
  )
  if (!result.matchedCount) throw new NotFoundError('No pending invitation with this id')

  res.status(StatusCodes.OK).json({ msg: 'Invitation cancelled' })
}

export const updateMemberRole = async (req, res) => {
  const membership = await membershipIn(req)
  requireOwner(membership)

  const target = await Membership.findOne({ _id: req.params.membershipId, organization: membership.organization._id })
  if (!target) throw new NotFoundError('No member with this id in this organization')

  const { role } = req.body
  if (target.role === 'owner' && role !== 'owner' && (await countOwners(target.organization)) === 1) {
    throw new ConflictError('An organization needs at least one owner. Make someone else an owner first.')
  }

  target.role = role
  await target.save()
  res.status(StatusCodes.OK).json({ membership: target })
}

// Not required by the brief, built to make the "owner leaves" decision concrete (see README):
// the last owner can't leave. Auto-promoting could hand the team to a viewer, deleting would
// wipe a pipeline other people rely on, so the owner has to pick a successor first.
export const leaveOrg = async (req, res) => {
  const membership = await membershipIn(req)

  if (membership.organization.personalOf) throw new BadRequestError("You can't leave your Personal workspace")
  if (membership.role === 'owner' && (await countOwners(membership.organization._id)) === 1) {
    throw new ConflictError("You're the last owner. Make someone else an owner before leaving.")
  }

  await membership.deleteOne()
  res.status(StatusCodes.OK).json({ msg: `You left ${membership.organization.name}` })
}
