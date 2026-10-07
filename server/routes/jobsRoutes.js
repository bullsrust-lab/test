import { Router } from 'express'
import {
  createJob,
  deleteJob,
  getAllJobs,
  getFollowUps,
  getJob,
  markFollowedUp,
  updateJob,
} from '../controllers/jobsController.js'
import { requireRole } from '../middleware/orgContext.js'
import { WRITE_ROLES } from '../models/Membership.js'
import {
  validateIdParam,
  validateJob,
  validateJobsQuery,
  validateJobUpdate,
} from '../middleware/validate.js'

// every route here runs after orgContext, so req.org is the active organization.
// Reads are open to every member, writes need owner or recruiter.
const canWrite = requireRole(...WRITE_ROLES)

const router = Router()

router.route('/').get(validateJobsQuery, getAllJobs).post(canWrite, validateJob, createJob)
// has to be above /:id, otherwise "follow-ups" is treated as an id
router.get('/follow-ups', getFollowUps)
router
  .route('/:id')
  .get(validateIdParam, getJob)
  .patch(canWrite, validateIdParam, validateJobUpdate, updateJob)
  .delete(canWrite, validateIdParam, deleteJob)
router.post('/:id/follow-up', canWrite, validateIdParam, markFollowedUp)

export default router
