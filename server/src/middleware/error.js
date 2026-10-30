export class AppError extends Error {
  constructor(status, code, message, fields = null) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function notFound(req, _res, next) {
  next(new AppError(404, 'not_found', `No route for ${req.method} ${req.originalUrl}.`));
}

export function errorHandler(err, _req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    const error = { code: err.code, message: err.message };

    if (err.fields) error.fields = err.fields;

    return res.status(err.status).json({ error });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'invalid_json', message: 'Request body must be valid JSON.' },
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'payload_too_large', message: 'Request body is too large.' },
    });
  }

  console.error('Unhandled error:', err);

  return res.status(500).json({
    error: { code: 'internal_error', message: 'An unexpected error occurred.' },
  });
}
