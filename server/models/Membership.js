import mongoose from 'mongoose'

export const ROLES = ['owner', 'recruiter', 'viewer']
export const WRITE_ROLES = ['owner', 'recruiter']

const MembershipSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organization: {
      type: mongoose.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    role: {
      type: String,
      enum: ROLES,
      required: true,
    },
  },
  { timestamps: true }
)

// one membership per user per org, also what makes the migration and invite accept safe to retry
MembershipSchema.index({ user: 1, organization: 1 }, { unique: true })
MembershipSchema.index({ organization: 1, role: 1 })

MembershipSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.__v
    return ret
  },
})

export default mongoose.model('Membership', MembershipSchema)
