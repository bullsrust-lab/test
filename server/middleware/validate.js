import { body, param, query, validationResult } from 'express-validator'
import mongoose from 'mongoose'
import { BadRequestError } from '../errors/index.js'
import { JOB_STATUS, JOB_TYPE } from '../models/Job.js'
import { ROLES } from '../models/Membership.js'

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

// rules for choosing a password: registration and accepting an invitation without an account
const newPassword = (chain) =>
  chain
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
    .withMessage('Password is too long')

export const validateRegister = withErrors([name(), email(), newPassword(body('password'))])

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

// isIn() accepts ?status=a&status=b because it checks every element of the array, so a single
// value is required first
export const validateJobsQuery = withErrors([
  query('status').optional().isString().bail().isIn(['all', ...JOB_STATUS]).withMessage('Invalid status filter'),
  query('jobType').optional().isString().bail().isIn(['all', ...JOB_TYPE]).withMessage('Invalid job type filter'),
  query('sort')
    .optional()
    .isString()
    .bail()
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

const objectId = (field, label) =>
  param(field)
    .custom((value) => mongoose.isValidObjectId(value))
    .withMessage(`Invalid ${label} id`)

export const validateOrgId = withErrors([objectId('orgId', 'organization')])

export const validateOrgName = withErrors([
  body('name')
    .isString()
    .withMessage('Name is required')
    .bail()
    .trim()
    .isLength({ min: 3, max: 80 })
    .withMessage('Name must be 3-80 characters')
    .bail()
    // the switcher would show two "Personal" entries
    .custom((value) => value.toLowerCase() !== 'personal')
    .withMessage('"Personal" is taken by your own workspace, pick another name'),
])

const role = () => body('role').isString().withMessage('Role is required').bail().isIn(ROLES).withMessage(`Role must be one of: ${ROLES.join(', ')}`)

export const validateInvite = withErrors([objectId('orgId', 'organization'), email(), role()])

export const validateInvitationId = withErrors([objectId('orgId', 'organization'), objectId('invitationId', 'invitation')])

export const validateRoleChange = withErrors([
  objectId('orgId', 'organization'),
  objectId('membershipId', 'membership'),
  role(),
])

export const validateMemberId = withErrors([objectId('orgId', 'organization'), objectId('membershipId', 'membership')])

export const validateToken = withErrors([
  param('token').isString().isLength({ min: 20, max: 100 }).withMessage('This invitation link is not valid'),
])

// a password is only needed when the invitee has no account and isn't signed in.
// Runs after the invitation itself was checked, so a used link answers 410 even without a body
export const validateAccept = withErrors([
  newPassword(body('password').if((value, { req }) => !req.user)),
  body('name')
    .optional()
    .isString()
    .withMessage('Name must be text')
    .bail()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2-50 characters'),
])
