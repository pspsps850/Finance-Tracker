import { z } from 'zod';
import { AppError } from './error.js';

export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});

    if (!result.success) {
      const fields = {};
      const { fieldErrors } = z.flattenError(result.error);

      for (const [key, messages] of Object.entries(fieldErrors)) {
        if (messages?.length) fields[key] = messages[0];
      }

      const message = result.error.issues[0]?.message || 'Invalid request.';
      const details = Object.keys(fields).length ? fields : null;
      return next(new AppError(400, 'invalid_input', message, details));
    }

    req.body = result.data;
    return next();
  };
}
