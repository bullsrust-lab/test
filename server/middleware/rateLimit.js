import rateLimit from 'express-rate-limit'

const FIFTEEN_MINUTES = 15 * 60 * 1000
const HOUR = 60 * 60 * 1000

const limiter = (options) =>
  rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    ...options,
  })

// password guessing: only failed attempts count, so normal logins and "demo" clicks never lock anyone out
export const authLimiter = limiter({
  windowMs: FIFTEEN_MINUTES,
  limit: 20,
  skipSuccessfulRequests: true,
  message: { msg: 'Too many attempts from this IP, please try again in 15 minutes' },
})

// every auth request costs a bcrypt hash or compare, so cap the total as well
export const authCeiling = limiter({
  windowMs: FIFTEEN_MINUTES,
  limit: 60,
  message: { msg: 'Too many requests from this IP, please try again in 15 minutes' },
})

export const registerLimiter = limiter({
  windowMs: HOUR,
  limit: 10,
  message: { msg: 'Too many accounts created from this IP, try again later' },
})

// general limit for the whole API, per IP (not per user: the demo account is shared)
export const apiLimiter = limiter({
  windowMs: FIFTEEN_MINUTES,
  limit: 600,
  message: { msg: 'Too many requests, please slow down' },
})

// changing the email answers "is this address taken?", so don't let it be used as a lookup tool
export const profileLimiter = limiter({
  windowMs: HOUR,
  limit: 10,
  keyGenerator: (req) => req.user.userId,
  message: { msg: 'Too many profile changes, try again later' },
})
