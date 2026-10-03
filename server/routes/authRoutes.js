import { Router } from 'express'
import { login, loginDemo, register } from '../controllers/authController.js'
import { validateLogin, validateRegister } from '../middleware/validate.js'
import { authCeiling, authLimiter, registerLimiter } from '../middleware/rateLimit.js'

const router = Router()

router.use(authCeiling, authLimiter)
router.post('/register', registerLimiter, validateRegister, register)
router.post('/login', validateLogin, login)
router.post('/demo', loginDemo)

export default router
