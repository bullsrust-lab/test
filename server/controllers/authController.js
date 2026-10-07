import { StatusCodes } from 'http-status-codes'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import { BadRequestError, NotFoundError, UnauthenticatedError } from '../errors/index.js'
import refreshDemo from '../utils/refreshDemo.js'
import { ensurePersonalOrg } from '../utils/orgs.js'
import withTransaction from '../utils/transaction.js'

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)

const sendUser = (res, statusCode, user) => {
  res.status(statusCode).json({ user, token: user.createJWT() })
}

export const register = async (req, res) => {
  const { name, email, password } = req.body

  if (await User.exists({ email })) {
    throw new BadRequestError('Email already in use')
  }

  // role is never taken from the body, everyone who registers is a regular user.
  // The account and its Personal workspace are created together, so v1-style solo use keeps working
  const user = await withTransaction(async (session) => {
    const [created] = await User.create([{ name, email, password }], { session })
    await ensurePersonalOrg(created._id, { session })
    return created
  })
  sendUser(res, StatusCodes.CREATED, user)
}

export const login = async (req, res) => {
  const { email, password } = req.body

  const user = await User.findOne({ email }).select('+password')
  if (!user) {
    // compare anyway, so "no such email" doesn't answer noticeably faster than "wrong password"
    await bcrypt.compare(password, DUMMY_HASH)
    throw new UnauthenticatedError('Invalid credentials')
  }
  if (!(await user.comparePassword(password))) {
    throw new UnauthenticatedError('Invalid credentials')
  }

  sendUser(res, StatusCodes.OK, user)
}

export const loginDemo = async (req, res) => {
  const user = await User.findOne({ role: 'demo' }).sort({ createdAt: 1 })
  if (!user) {
    throw new NotFoundError('Demo account is not set up yet')
  }

  try {
    await refreshDemo(user._id)
  } catch (error) {
    // stale demo dates are not worth failing the login over
    console.error('Could not refresh demo data', error.message)
  }

  sendUser(res, StatusCodes.OK, user)
}
