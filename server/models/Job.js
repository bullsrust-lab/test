import mongoose from 'mongoose'

export const JOB_STATUS = ['pending', 'interview', 'declined']
export const JOB_TYPE = ['full-time', 'part-time', 'remote']

const JobSchema = new mongoose.Schema(
  {
    company: {
      type: String,
      required: [true, 'Please provide a company'],
      trim: true,
      maxlength: 60,
    },
    position: {
      type: String,
      required: [true, 'Please provide a position'],
      trim: true,
      maxlength: 100,
    },
    status: {
      type: String,
      enum: JOB_STATUS,
      default: 'pending',
    },
    jobType: {
      type: String,
      enum: JOB_TYPE,
      default: 'full-time',
    },
    jobLocation: {
      type: String,
      required: [true, 'Please provide a location'],
      trim: true,
      maxlength: 80,
    },
    createdBy: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // set by the server only (never taken from the request body), used for follow-up reminders
    statusChangedAt: Date,
    repliedAt: Date,
    followedUpAt: Date,
  },
  { timestamps: true }
)

JobSchema.index({ createdBy: 1, createdAt: -1 })
JobSchema.index({ createdBy: 1, position: 1 })

// a job leaving "pending" for the first time is when the company replied
JobSchema.pre('save', function () {
  if (this.isNew || !this.isModified('status')) return
  const now = new Date()
  this.statusChangedAt = now
  if (!this.repliedAt && this.status !== 'pending') this.repliedAt = now
})

JobSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.__v
    return ret
  },
})

export default mongoose.model('Job', JobSchema)
