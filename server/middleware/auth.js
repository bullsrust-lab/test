import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { UnauthenticatedError } from '../errors/index.js'

const auth = (req, res, next) => {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthenticatedError()
  }

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

  req.user = { userId, name, role }
  next()
}

export default auth
