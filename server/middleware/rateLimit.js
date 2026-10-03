import rateLimit from 'express-rate-limit'

// only failed attempts count, so logging in a few times (or clicking "demo") never locks anyone out,
// but guessing passwords still gets cut off after 20 wrong tries
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { msg: 'Too many attempts from this IP, please try again in 15 minutes' },
})
