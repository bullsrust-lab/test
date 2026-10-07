import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { ROLES } from './Membership.js'

export const INVITE_TTL_DAYS = 7

// only a hash of the token is stored: a leaked database dump can't be used to join anyone's team
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

const InvitationSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ROLES,
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked'],
      default: 'pending',
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    invitedBy: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    acceptedBy: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
    },
    acceptedAt: Date,
  },
  { timestamps: true }
)

InvitationSchema.index({ organization: 1, email: 1, status: 1 })

InvitationSchema.statics.generateToken = () => {
  const token = crypto.randomBytes(32).toString('base64url')
  return { token, tokenHash: hashToken(token) }
}

InvitationSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.__v
    delete ret.tokenHash
    return ret
  },
})

export default mongoose.model('Invitation', InvitationSchema)
