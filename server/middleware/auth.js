import jwt from 'jsonwebtoken'
import { UnauthenticatedError } from '../errors/index.js'

const auth = (req, res, next) => {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthenticatedError()
  }

  try {
    const { userId, name, role } = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET)
    req.user = { userId, name, role }
  } catch {
    throw new UnauthenticatedError()
  }
  next()
}

export default auth
