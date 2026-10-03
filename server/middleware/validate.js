import { body, param, query, validationResult } from 'express-validator'
import mongoose from 'mongoose'
import { BadRequestError } from '../errors/index.js'
import { JOB_STATUS, JOB_TYPE } from '../models/Job.js'

// the usual suspects from leaked-password lists, checked case-insensitively
const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '11111111',
  '00000000',
  '87654321',
  '12341234',
  'password',
  'password1',
  'password123',
  'passw0rd',
  'qwerty123',
  'qwertyuiop',
  'qwerty12',
  'iloveyou',
  'sunshine',
  'football',
  'baseball',
  'superman',
  'princess',
  'whatever',
  'trustno1',
  'letmein1',
  'welcome1',
  'abc12345',
  'abcd1234',
  'asdfghjk',
  'zaq12wsx',
  '1q2w3e4r',
  '1qaz2wsx',
  'changeme',
  'jobtrail',
  'jobtrail1',
])

const withErrors = (rules) => [
  ...rules,
  (req, res, next) => {
    const result = validationResult(req)
    if (result.isEmpty()) return next()

    const fields = result.array({ onlyFirstError: true }).map((e) => ({ field: e.path, msg: e.msg }))
    const err = new BadRequestError(fields.map((f) => f.msg).join(', '))
    err.fields = fields
    throw err
  },
]

// every text field is checked with isString() first: arrays/objects/numbers in JSON
// would otherwise reach the sanitizers or bcrypt and blow up with a 500
const name = () =>
  body('name')
    .isString()
    .withMessage('Name is required')
    .bail()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2-50 characters')

const email = () =>
  body('email')
    .isString()
    .withMessage('Email is required')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .bail()
    .isEmail()
    .withMessage('Please provide a valid email')
    .toLowerCase()

export const validateRegister = withErrors([
  name(),
  email(),
  body('password')
    .isString()
    .withMessage('Password is required')
    .bail()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .bail()
    .custom((value) => !COMMON_PASSWORDS.has(value.toLowerCase()))
    .withMessage('This password is too common, pick something else')
    // bcrypt only looks at the first 72 bytes, anything after that would be silently ignored
    .custom((value) => Buffer.byteLength(value, 'utf8') <= 72)
    .withMessage('Password is too long'),
])

export const validateLogin = withErrors([
  email(),
  body('password').isString().withMessage('Password is required').bail().notEmpty().withMessage('Password is required'),
])

export const validateUpdateUser = withErrors([name(), email()])

const jobField = (field, label, max, optional) => {
  let chain = body(field)
  chain = optional ? chain.optional() : chain.exists({ values: 'falsy' }).withMessage(`${label} is required`).bail()
  return chain
    .isString()
    .withMessage(`${label} must be text`)
    .bail()
    .trim()
    .notEmpty()
    .withMessage(`${label} is required`)
    .isLength({ max })
    .withMessage(`${label} is too long (max ${max})`)
}

const enumField = (field, values, msg) =>
  body(field).optional().isString().withMessage(msg).bail().isIn(values).withMessage(msg)

const jobRules = (optional) => [
  jobField('company', 'Company', 60, optional),
  jobField('position', 'Position', 100, optional),
  jobField('jobLocation', 'Location', 80, optional),
  enumField('status', JOB_STATUS, 'Invalid status'),
  enumField('jobType', JOB_TYPE, 'Invalid job type'),
]

export const validateJob = withErrors(jobRules(false))

// PATCH may send only the fields that changed
export const validateJobUpdate = withErrors(jobRules(true))

export const validateIdParam = withErrors([
  param('id')
    .custom((value) => mongoose.isValidObjectId(value))
    .withMessage('Invalid job id'),
])

const NUL = String.fromCharCode(0)

export const validateJobsQuery = withErrors([
  query('status').optional().isIn(['all', ...JOB_STATUS]).withMessage('Invalid status filter'),
  query('jobType').optional().isIn(['all', ...JOB_TYPE]).withMessage('Invalid job type filter'),
  query('sort')
    .optional()
    .isIn(['latest', 'oldest', 'a-z', 'z-a'])
    .withMessage('Invalid sort option'),
  query('search')
    .optional()
    .isString()
    .withMessage('Invalid search')
    .bail()
    .isLength({ max: 100 })
    .withMessage('Search is too long')
    .bail()
    // MongoDB refuses a regex with a NUL byte in it (500 instead of a clean 400)
    .custom((value) => !value.includes(NUL))
    .withMessage('Invalid search'),
])
