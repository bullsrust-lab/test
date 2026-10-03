import { Router } from 'express'
import { getCurrentUser, updateUser } from '../controllers/userController.js'
import { validateUpdateUser } from '../middleware/validate.js'
import { profileLimiter } from '../middleware/rateLimit.js'

const router = Router()

router.route('/me').get(getCurrentUser).patch(profileLimiter, validateUpdateUser, updateUser)

export default router
