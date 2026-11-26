export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function success(res, status, message, data, extra = {}) {
  return res.status(status).json({ success: true, message, data, ...extra })
}

export function handleError(error, req, res, next) {
  if (res.headersSent) return next(error)
  const known = {
    '23505': [409, 'A record with this value already exists'],
    '23503': [400, 'A referenced record does not exist or is still in use'],
    '23514': [400, 'A value violates a data constraint'],
    '23502': [400, 'A required value is missing'],
    '22P02': [400, 'Invalid value'],
    '22007': [400, 'Invalid date'],
    '22008': [400, 'Invalid date'],
    'entity.parse.failed': [400, 'Malformed JSON body'],
    'entity.too.large': [413, 'Request body is too large'],
    'encoding.unsupported': [415, 'Unsupported request encoding'],
    'charset.unsupported': [415, 'Unsupported request charset']
  }
  const [status, message] = error instanceof HttpError
    ? [error.status, error.message]
    : (known[error.code ?? error.type] ?? [500, 'Internal server error'])
  if (status === 500) console.error('Request failed', { method: req.method, code: error.code })
  return res.status(status).json({ success: false, message })
}
