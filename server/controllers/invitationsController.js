import { StatusCodes } from 'http-status-codes'
import Invitation, { hashToken } from '../models/Invitation.js'
import Membership from '../models/Membership.js'
import User from '../models/User.js'
import { ConflictError, ForbiddenError, GoneError, NotFoundError, UnauthenticatedError } from '../errors/index.js'
import { ensurePersonalOrg } from '../utils/orgs.js'
import withTransaction from '../utils/transaction.js'

// 404 for a token that never existed, 410 for one that did but can't be used any more
const findUsableInvitation = async (token) => {
  const invitation = await Invitation.findOne({ tokenHash: hashToken(token) })
    .populate('organization', 'name slug personalOf')
    .populate('invitedBy', 'name')
  if (!invitation || !invitation.organization) throw new NotFoundError('This invitation link is not valid')

  if (invitation.status === 'accepted') throw new GoneError('This invitation has already been used')
  if (invitation.status === 'revoked') throw new GoneError('This invitation was cancelled')
  if (invitation.expiresAt <= new Date()) throw new GoneError('This invitation has expired')
  return invitation
}

// marks the invitation used, but only if nobody else did in the meantime
const consume = async (invitation, userId, session) => {
  const result = await Invitation.updateOne(
    { _id: invitation._id, status: 'pending', expiresAt: { $gt: new Date() } },
    { $set: { status: 'accepted', acceptedBy: userId, acceptedAt: new Date() } },
    { session }
  )
  if (result.modifiedCount !== 1) throw new GoneError('This invitation has already been used')
}

const summary = (invitation) => ({
  _id: invitation.organization._id,
  name: invitation.organization.name,
  slug: invitation.organization.slug,
})

// what the accept page shows before anyone types anything
export const previewInvitation = async (req, res) => {
  const invitation = await findUsableInvitation(req.params.token)

  res.status(StatusCodes.OK).json({
    invitation: {
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      organization: summary(invitation),
      invitedBy: invitation.invitedBy?.name,
    },
    // only someone holding the link learns this, and the link was sent to that address
    hasAccount: Boolean(await User.exists({ email: invitation.email })),
  })
}

export const acceptInvitation = async (req, res) => {
  const invitation = await findUsableInvitation(req.params.token)

  // flow 1: signed in. The account has to be the one the invitation was sent to
  if (req.user) {
    const user = await User.findById(req.user.userId)
    if (!user) throw new UnauthenticatedError()
    if (user.email !== invitation.email) {
      throw new ForbiddenError(`This invitation is for ${invitation.email}, but you're signed in as ${user.email}`)
    }

    const membership = await withTransaction(async (session) => {
      // already in the team (e.g. invited twice): keep the role they have, just use up the link
      await Membership.updateOne(
        { user: user._id, organization: invitation.organization._id },
        { $setOnInsert: { role: invitation.role } },
        { upsert: true, session }
      )
      await consume(invitation, user._id, session)
      return Membership.findOne({ user: user._id, organization: invitation.organization._id }).session(session)
    })

    return res.status(StatusCodes.OK).json({ organization: summary(invitation), role: membership.role })
  }

  // flow 2: anonymous. Only for addresses without an account, see ADR-003 for why we don't
  // treat the password as a login here
  if (await User.exists({ email: invitation.email })) {
    throw new ConflictError('An account with this email already exists. Log in to accept the invitation.')
  }

  const { password } = req.body
  // the brief only asks for a password; a name is optional and defaults to the email's first part
  const localPart = invitation.email.split('@')[0].slice(0, 50)
  const name = req.body.name || (localPart.length >= 2 ? localPart : 'New member')

  // all or nothing: an account without the membership, or a used link without an account,
  // would both leave the invitee stuck
  const user = await withTransaction(async (session) => {
    const [created] = await User.create([{ name, email: invitation.email, password }], { session })
    await ensurePersonalOrg(created._id, { session })
    await Membership.create([{ user: created._id, organization: invitation.organization._id, role: invitation.role }], {
      session,
    })
    await consume(invitation, created._id, session)
    return created
  })

  res.status(StatusCodes.CREATED).json({
    user,
    token: user.createJWT(),
    organization: summary(invitation),
    role: invitation.role,
  })
}
