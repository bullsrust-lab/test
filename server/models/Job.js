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
  },
  { timestamps: true }
)

JobSchema.index({ createdBy: 1, createdAt: -1 })
JobSchema.index({ createdBy: 1, position: 1 })

JobSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.__v
    return ret
  },
})

export default mongoose.model('Job', JobSchema)
