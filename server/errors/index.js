import { StatusCodes } from 'http-status-codes'

export class ApiError extends Error {
  // code: optional machine-readable reason for the client, next to the human message
  constructor(message, statusCode, code) {
    super(message)
    this.statusCode = statusCode
    if (code) this.code = code
  }
}

export class BadRequestError extends ApiError {
  constructor(message) {
    super(message, StatusCodes.BAD_REQUEST)
  }
}

export class UnauthenticatedError extends ApiError {
  constructor(message = 'Authentication invalid') {
    super(message, StatusCodes.UNAUTHORIZED)
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Not allowed to access this resource', code) {
    super(message, StatusCodes.FORBIDDEN, code)
  }
}

export class ConflictError extends ApiError {
  constructor(message) {
    super(message, StatusCodes.CONFLICT)
  }
}

export class GoneError extends ApiError {
  constructor(message) {
    super(message, StatusCodes.GONE)
  }
}

export class NotFoundError extends ApiError {
  constructor(message) {
    super(message, StatusCodes.NOT_FOUND)
  }
}
