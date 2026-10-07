import { Router } from 'express'
import { acceptInvitation, previewInvitation } from '../controllers/invitationsController.js'
import { optionalAuth } from '../middleware/auth.js'
import demoUser from '../middleware/demoUser.js'
import { acceptLimiter, authCeiling } from '../middleware/rateLimit.js'
import { validateAccept, validateToken } from '../middleware/validate.js'

// public routes: the invitee may not have an account yet
const router = Router()

router.use(authCeiling)
router.get('/:token', validateToken, previewInvitation)
router.post('/:token/accept', optionalAuth, demoUser, acceptLimiter, validateAccept, acceptInvitation)

export default router
