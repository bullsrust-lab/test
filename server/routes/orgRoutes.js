import { Router } from 'express'
import {
  createInvitation,
  createOrg,
  getOrg,
  leaveOrg,
  listMyOrgs,
  revokeInvitation,
  updateMemberRole,
} from '../controllers/orgsController.js'
import {
  validateInvitationId,
  validateInvite,
  validateOrgId,
  validateOrgName,
  validateRoleChange,
} from '../middleware/validate.js'

// these routes take the org from the URL, not from X-Org-Id: you manage a specific team here,
// and every handler checks your membership (and owner role where needed) in that team
const router = Router()

router.route('/').get(listMyOrgs).post(validateOrgName, createOrg)
router.get('/:orgId', validateOrgId, getOrg)
router.post('/:orgId/invitations', validateInvite, createInvitation)
router.delete('/:orgId/invitations/:invitationId', validateInvitationId, revokeInvitation)
router.delete('/:orgId/memberships/me', validateOrgId, leaveOrg)
router.patch('/:orgId/memberships/:membershipId', validateRoleChange, updateMemberRole)

export default router
