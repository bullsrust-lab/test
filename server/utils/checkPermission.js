import { ForbiddenError } from '../errors/index.js'

const checkPermission = (requestUser, resourceUserId) => {
  if (requestUser.userId === resourceUserId.toString()) return
  throw new ForbiddenError('You can only change your own jobs')
}

export default checkPermission
