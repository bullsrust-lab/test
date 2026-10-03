import { Router } from 'express'
import { getCurrentUser, updateUser } from '../controllers/userController.js'
import { validateUpdateUser } from '../middleware/validate.js'

const router = Router()

router.route('/me').get(getCurrentUser).patch(validateUpdateUser, updateUser)

export default router
