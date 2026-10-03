import { ForbiddenError } from '../errors/index.js'

// the demo account is shared by everyone who clicks "Try demo", so keep it read-only
const demoUser = (req, res, next) => {
  if (req.user?.role === 'demo' && req.method !== 'GET') {
    throw new ForbiddenError('Demo user. Read only!')
  }
  next()
}

export default demoUser
