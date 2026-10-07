import { StatusCodes } from 'http-status-codes'

export class ApiError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.statusCode = statusCode
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
  constructor(message = 'Not allowed to access this resource') {
    super(message, StatusCodes.FORBIDDEN)
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
