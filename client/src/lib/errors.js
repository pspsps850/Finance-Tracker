export class ApiError extends Error {
  constructor(message, { status = 0, code = 'request_failed', fields = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export function isApiError(error) {
  return error instanceof ApiError
}

export function errorMessage(error, fallback = 'Something went wrong. Try again.') {
  if (!error) return fallback
  if (isApiError(error) && error.message) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function fieldErrors(error) {
  return isApiError(error) && error.fields ? error.fields : {}
}
