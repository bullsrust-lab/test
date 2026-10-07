import mongoose from 'mongoose'

const OrganizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
      minlength: [3, 'Name must be 3-80 characters'],
      maxlength: [80, 'Name must be 3-80 characters'],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // set only on the automatic "Personal" workspace. The unique index means a user can never
    // end up with two of them, even if registration and the migration race each other
    personalOf: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
)

OrganizationSchema.index({ personalOf: 1 }, { unique: true, partialFilterExpression: { personalOf: { $exists: true } } })

OrganizationSchema.virtual('personal').get(function () {
  return Boolean(this.personalOf)
})

OrganizationSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret.__v
    delete ret.id
    return ret
  },
})

export default mongoose.model('Organization', OrganizationSchema)
