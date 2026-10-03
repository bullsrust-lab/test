import { Router } from 'express'
import { login, loginDemo, register } from '../controllers/authController.js'
import { validateLogin, validateRegister } from '../middleware/validate.js'
import { authLimiter } from '../middleware/rateLimit.js'

const router = Router()

router.use(authLimiter)
router.post('/register', validateRegister, register)
router.post('/login', validateLogin, login)
router.post('/demo', loginDemo)

export default router
