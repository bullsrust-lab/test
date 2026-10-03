import { Router } from 'express'
import {
  createJob,
  deleteJob,
  getAllJobs,
  getJob,
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
// has to be above /:id, otherwise "stats" is treated as an id
router.get('/stats', showStats)
router
  .route('/:id')
  .get(validateIdParam, getJob)
  .patch(validateIdParam, validateJobUpdate, updateJob)
  .delete(validateIdParam, deleteJob)

export default router
