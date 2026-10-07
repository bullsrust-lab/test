import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { UnauthenticatedError } from '../errors/index.js'

const readUser = (header) => {
  if (!header || !header.startsWith('Bearer ')) throw new UnauthenticatedError()

  let payload
  try {
    payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    throw new UnauthenticatedError()
  }

  // userId ends up in database filters, so make sure it really is an id
  const { userId, name, role } = payload
  if (typeof userId !== 'string' || !mongoose.isValidObjectId(userId)) {
    throw new UnauthenticatedError()
  }

  return { userId, name, role }
}

const auth = (req, res, next) => {
  req.user = readUser(req.headers.authorization)
  next()
}

// for routes that work both signed in and anonymously (accepting an invitation).
// A token that is sent but invalid is still a 401, it's not silently treated as "anonymous"
export const optionalAuth = (req, res, next) => {
  if (req.headers.authorization) req.user = readUser(req.headers.authorization)
  next()
}

export default auth
