import { StatusCodes } from 'http-status-codes'
import User from '../models/User.js'
import { BadRequestError, NotFoundError, UnauthenticatedError } from '../errors/index.js'

const sendUser = (res, statusCode, user) => {
  res.status(statusCode).json({ user, token: user.createJWT() })
}

export const register = async (req, res) => {
  const { name, email, password } = req.body

  if (await User.exists({ email })) {
    throw new BadRequestError('Email already in use')
  }

  // role is never taken from the body, everyone who registers is a regular user
  const user = await User.create({ name, email, password })
  sendUser(res, StatusCodes.CREATED, user)
}

export const login = async (req, res) => {
  const { email, password } = req.body

  const user = await User.findOne({ email }).select('+password')
  if (!user || !(await user.comparePassword(password))) {
    throw new UnauthenticatedError('Invalid credentials')
  }

  sendUser(res, StatusCodes.OK, user)
}

export const loginDemo = async (req, res) => {
  const user = await User.findOne({ role: 'demo' })
  if (!user) {
    throw new NotFoundError('Demo account is not set up yet')
  }

  sendUser(res, StatusCodes.OK, user)
}
