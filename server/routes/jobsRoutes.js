import { Router } from 'express'
import {
  createJob,
  deleteJob,
  getAllJobs,
  getFollowUps,
  getJob,
  markFollowedUp,
  showStats,
  updateJob,
} from '../controllers/jobsController.js'
import {
  validateIdParam,
  validateJob,
  validateJobsQuery,
  validateJobUpdate,
} from '../middleware/validate.js'

const router = Router()

router.route('/').get(validateJobsQuery, getAllJobs).post(validateJob, createJob)
// these two have to be above /:id, otherwise "stats" is treated as an id
router.get('/stats', showStats)
router.get('/follow-ups', getFollowUps)
router
  .route('/:id')
  .get(validateIdParam, getJob)
  .patch(validateIdParam, validateJobUpdate, updateJob)
  .delete(validateIdParam, deleteJob)
router.post('/:id/follow-up', validateIdParam, markFollowedUp)

export default router
