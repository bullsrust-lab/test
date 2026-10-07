import { StatusCodes } from 'http-status-codes'
import User from '../models/User.js'
import Job from '../models/Job.js'
import { BadRequestError, UnauthenticatedError } from '../errors/index.js'

// a valid token for a user that no longer exists is treated like an invalid session,
// so the client's 401 handler logs it out instead of getting stuck
export const getCurrentUser = async (req, res) => {
  const user = await User.findById(req.user.userId)
  if (!user) throw new UnauthenticatedError()

  res.status(StatusCodes.OK).json({ user })
}

export const updateUser = async (req, res) => {
  const { name, email } = req.body

  const taken = await User.exists({ email, _id: { $ne: req.user.userId } })
  if (taken) throw new BadRequestError('Email already in use')

  const user = await User.findById(req.user.userId)
  if (!user) throw new UnauthenticatedError()

  const renamed = user.name !== name
  user.name = name
  user.email = email
  await user.save()

  // createdByName is a copy, this is the price of not looking authors up on every list request
  if (renamed) await Job.updateMany({ createdBy: user._id }, { $set: { createdByName: name } })

  // name is part of the token payload, so hand out a fresh one
  res.status(StatusCodes.OK).json({ user, token: user.createJWT() })
}
