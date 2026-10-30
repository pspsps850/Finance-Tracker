import { AppError } from './error.js';
import { clearSessionCookie, findSessionUser, readSessionToken } from '../services/session.js';

export async function requireAuth(req, res, next) {
  try {
    const token = readSessionToken(req);
    const found = token ? await findSessionUser(token) : null;

    if (!found) {
      if (token) clearSessionCookie(res);
      throw new AppError(401, 'unauthorized', 'Your session expired. Sign in again.');
    }

    req.user = found.user;
    req.session = found.session;
    next();
  } catch (error) {
    next(error);
  }
}
