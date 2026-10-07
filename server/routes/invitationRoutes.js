import { Router } from 'express'
import {
  acceptInvitation,
  loadInvitation,
  previewInvitation,
  rejectExistingAccount,
} from '../controllers/invitationsController.js'
import { optionalAuth } from '../middleware/auth.js'
import demoUser from '../middleware/demoUser.js'
import { acceptLimiter, authCeiling } from '../middleware/rateLimit.js'
import { validateAccept, validateToken } from '../middleware/validate.js'

// public routes: the invitee may not have an account yet
const router = Router()

router.use(authCeiling)
router.get('/:token', validateToken, loadInvitation, previewInvitation)
// order matters: the link's state (404/410) and "account exists" (409) are answered before the
// body is validated, so a stale link never comes back as "Password is required"
router.post(
  '/:token/accept',
  optionalAuth,
  demoUser,
  acceptLimiter,
  validateToken,
  loadInvitation,
  rejectExistingAccount,
  validateAccept,
  acceptInvitation
)

export default router
