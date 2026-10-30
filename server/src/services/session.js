import { createHash, randomBytes } from 'node:crypto';
import { db } from '../db/pool.js';

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'ft_sid';
const parsedTtl = Number.parseInt(process.env.SESSION_TTL_DAYS, 10);
const TTL_DAYS = Number.isInteger(parsedTtl) && parsedTtl > 0 ? parsedTtl : 30;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_MS,
  };
}

export function readSessionToken(req) {
  return req.cookies?.[COOKIE_NAME] || null;
}

export async function createSession(userId, res) {
  const token = randomBytes(32).toString('base64url');

  await db.execute('DELETE FROM sessions WHERE user_id = ? AND expires_at <= NOW()', [userId]);

  await db.execute(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES (?, ?, TIMESTAMPADD(DAY, ?, NOW()))`,
    [userId, hashToken(token), TTL_DAYS],
  );

  res.cookie(COOKIE_NAME, token, cookieOptions());

  return token;
}

export async function findSessionUser(token) {
  if (!token) return null;

  const [rows] = await db.execute(
    `SELECT s.id AS session_id,
            u.id, u.email, u.display_name, u.base_currency, u.timezone, u.email_verified_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.expires_at > NOW()
        AND u.deleted_at IS NULL
      LIMIT 1`,
    [hashToken(token)],
  );

  if (!rows.length) return null;

  const row = rows[0];

  return {
    session: { id: row.session_id },
    user: {
      id: row.id,
      email: row.email,
      display_name: row.display_name,
      base_currency: row.base_currency,
      timezone: row.timezone,
      email_verified_at: row.email_verified_at,
    },
  };
}

export async function revokeSession(token) {
  if (!token) return;

  await db.execute('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
}

export function clearSessionCookie(res) {
  const options = cookieOptions();
  delete options.maxAge;
  res.clearCookie(COOKIE_NAME, options);
}
