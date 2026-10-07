import { StatusCodes } from 'http-status-codes'
import Organization from '../models/Organization.js'
import Membership from '../models/Membership.js'
import Invitation, { INVITE_TTL_DAYS } from '../models/Invitation.js'
import Job from '../models/Job.js'
import User from '../models/User.js'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors/index.js'
import { adoptOrphanJobs, createOrganization, ensurePersonalOrg } from '../utils/orgs.js'
import { DAY } from '../utils/followUp.js'
import withTransaction from '../utils/transaction.js'

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

const countOwners = (organizationId, session) =>
  Membership.countDocuments({ organization: organizationId, role: 'owner' }).session(session)

// Every change that can remove an owner runs in a transaction that first writes the org document.
// Two such changes at the same time then conflict, and the retried one sees the other's result
// (snapshot isolation alone would let both read "2 owners" and both remove one).
// fn gets the session and the caller's membership as it is inside the transaction.
const ownerChange = (organizationId, userId, fn) =>
  withTransaction(async (session) => {
    await Organization.updateOne(
      { _id: organizationId },
      { $set: { updatedAt: new Date() } },
      { session, timestamps: false }
    )
    const me = await Membership.findOne({ user: userId, organization: organizationId }).session(session)
    return fn(session, me)
  })

// invitations an owner sent stop working once they're no longer an owner (demoted, removed, left)
const revokeInvitesFrom = (organizationId, userId, session) =>
  Invitation.updateMany(
    { organization: organizationId, invitedBy: userId, status: 'pending' },
    { $set: { status: 'revoked' } },
    { session }
  )

const LAST_OWNER = 'An organization needs at least one owner. Make someone else an owner first.'

// where the invitee should land. APP_URL wins when the API and the site live on different hosts
const appUrl = (req) => process.env.APP_URL || `${req.protocol}://${req.get('host')}`

export const listMyOrgs = async (req, res) => {
  let memberships = await Membership.find({ user: req.user.userId }).populate('organization').lean()
  let personal = memberships.find((m) => m.organization?.personalOf)
  if (!personal) {
    await ensurePersonalOrg(req.user.userId)
    memberships = await Membership.find({ user: req.user.userId }).populate('organization').lean()
    personal = memberships.find((m) => m.organization?.personalOf)
  }
  // jobs the old version created during the deploy window (see ADR-002); almost always a no-op
  if (personal) await adoptOrphanJobs(req.user.userId, personal.organization._id)

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
  const orgId = membership.organization._id
  const { role } = req.body

  const target = await ownerChange(orgId, req.user.userId, async (session, me) => {
    if (me?.role !== 'owner') throw new ForbiddenError('Only an owner can do this')
    const member = await Membership.findOne({ _id: req.params.membershipId, organization: orgId }).session(session)
    if (!member) throw new NotFoundError('No member with this id in this organization')

    const demotesOwner = member.role === 'owner' && role !== 'owner'
    if (demotesOwner && (await countOwners(orgId, session)) === 1) throw new ConflictError(LAST_OWNER)

    member.role = role
    await member.save({ session })
    if (demotesOwner) await revokeInvitesFrom(orgId, member.user, session)
    return member
  })

  res.status(StatusCodes.OK).json({ membership: target })
}

export const removeMember = async (req, res) => {
  const membership = await membershipIn(req)
  requireOwner(membership)
  const { organization } = membership
  if (organization.personalOf) throw new BadRequestError('A Personal workspace has no other members')

  await ownerChange(organization._id, req.user.userId, async (session, me) => {
    if (me?.role !== 'owner') throw new ForbiddenError('Only an owner can do this')
    const member = await Membership.findOne({ _id: req.params.membershipId, organization: organization._id }).session(
      session
    )
    if (!member) throw new NotFoundError('No member with this id in this organization')
    if (member.user.equals(me.user)) throw new BadRequestError('To remove yourself, leave the organization instead')
    if (member.role === 'owner' && (await countOwners(organization._id, session)) === 1) {
      throw new ConflictError(LAST_OWNER)
    }

    await member.deleteOne({ session })
    await revokeInvitesFrom(organization._id, member.user, session)
  })

  res.status(StatusCodes.OK).json({ msg: 'Member removed' })
}

// Not required by the brief, built to make the "owner leaves" decision concrete (see README):
// the last owner can't leave while others are in the team. Auto-promoting could hand the team to
// a viewer, deleting would wipe a pipeline other people rely on, so the owner picks a successor.
// An owner who is the only member is the exception: nobody else relies on it, so the team goes.
export const leaveOrg = async (req, res) => {
  const membership = await membershipIn(req)
  const { organization } = membership
  if (organization.personalOf) throw new BadRequestError("You can't leave your Personal workspace")

  const msg = await ownerChange(organization._id, req.user.userId, async (session, me) => {
    if (!me) throw new ForbiddenError("You're not a member of this organization")

    if (me.role === 'owner') {
      const members = await Membership.countDocuments({ organization: organization._id }).session(session)
      if (members === 1) {
        await Job.deleteMany({ organization: organization._id }, { session })
        await Invitation.deleteMany({ organization: organization._id }, { session })
        await me.deleteOne({ session })
        await Organization.deleteOne({ _id: organization._id }, { session })
        return `${organization.name} was deleted`
      }
      if ((await countOwners(organization._id, session)) === 1) {
        throw new ConflictError("You're the last owner. Make someone else an owner before leaving.")
      }
      await revokeInvitesFrom(organization._id, me.user, session)
    }

    await me.deleteOne({ session })
    return `You left ${organization.name}`
  })

  res.status(StatusCodes.OK).json({ msg })
}
