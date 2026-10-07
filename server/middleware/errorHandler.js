import { StatusCodes } from 'http-status-codes'

const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR
  let msg = err.statusCode ? err.message : 'Something went wrong, try again later'

  if (err.name === 'ValidationError') {
    statusCode = StatusCodes.BAD_REQUEST
    msg = Object.values(err.errors)
      .map((item) => item.message)
      .join(', ')
  }

  if (err.code === 11000) {
    statusCode = StatusCodes.BAD_REQUEST
    msg = 'Email already in use'
  }

  if (err.name === 'CastError') {
    statusCode = StatusCodes.BAD_REQUEST
    msg = `Invalid id: ${err.value}`
  }

  // thrown by express.json() before our code runs
  if (err.type === 'entity.parse.failed') {
    statusCode = StatusCodes.BAD_REQUEST
    msg = 'Invalid JSON'
  }
  if (err.type === 'entity.too.large') {
    statusCode = StatusCodes.REQUEST_TOO_LONG
    msg = 'Request body is too large'
  }

  if (statusCode === StatusCodes.INTERNAL_SERVER_ERROR) console.error(err)

  const body = { msg }
  // Mongo errors carry a numeric code too, only our own string codes go to the client
  if (err.statusCode && typeof err.code === 'string') body.code = err.code
  if (Array.isArray(err.fields)) body.errors = err.fields
  res.status(statusCode).json(body)
}

export default errorHandler
