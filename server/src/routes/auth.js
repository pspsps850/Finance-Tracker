import { randomInt } from 'node:crypto';
import express from 'express';
import argon2 from '@node-rs/argon2';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { AppError } from '../middleware/error.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { sendOtpEmail } from '../services/mailer.js';
import {
  clearSessionCookie,
  createSession,
  readSessionToken,
  revokeSession,
} from '../services/session.js';

function intEnv(name, fallback, min = 1) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value >= min ? value : fallback;
}

const OTP_TTL_MINUTES = intEnv('OTP_TTL_MINUTES', 10);
const OTP_MAX_ATTEMPTS = intEnv('OTP_MAX_ATTEMPTS', 5);
const OTP_RESEND_COOLDOWN_SECONDS = intEnv('OTP_RESEND_COOLDOWN_SECONDS', 60);

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(255, 'Email is too long.')
  .pipe(z.email({ error: 'Enter a valid email address.' }));

const registerSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, 'Tell us what to call you.')
    .max(100, 'Name is too long.'),
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .max(128, 'Use 128 characters or fewer.'),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(128, 'Use 128 characters or fewer.'),
});

const verifyOtpSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from the email.'),
});

const resendOtpSchema = z.object({
  email: emailSchema,
});

let dummyHash = null;

async function getDummyHash() {
  if (!dummyHash) dummyHash = await argon2.hash('timing-equalizer-not-a-password');
  return dummyHash;
}

async function verifyHash(hash, value) {
  try {
    return await argon2.verify(hash, value);
  } catch {
    return false;
  }
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    base_currency: user.base_currency,
    timezone: user.timezone,
    email_verified_at: user.email_verified_at,
  };
}

function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

async function issueOtp(userId, email) {
  const code = generateOtp();
  const hash = await argon2.hash(code);

  await db.execute(
    `UPDATE users
        SET otp_hash = ?,
            otp_expires_at = TIMESTAMPADD(MINUTE, ?, NOW()),
            otp_attempts = 0,
            otp_sent_at = NOW()
      WHERE id = ?`,
    [hash, OTP_TTL_MINUTES, userId],
  );

  try {
    await sendOtpEmail({ to: email, code, expiresInMinutes: OTP_TTL_MINUTES });
  } catch (error) {
    await db.execute('UPDATE users SET otp_sent_at = NULL WHERE id = ?', [userId]);
    throw error;
  }
}

function limiter({ windowMs, limit, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: { code: 'rate_limited', message: 'Too many requests. Try again later.' },
      }),
  });
}

const router = express.Router();

router.post(
  '/register',
  limiter({ windowMs: 60 * 60 * 1000, limit: 10 }),
  validate(registerSchema),
  async (req, res) => {
    const { display_name: displayName, email, password } = req.body;
    const passwordHash = await argon2.hash(password);

    let userId;

    try {
      const [result] = await db.execute(
        'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)',
        [email, passwordHash, displayName],
      );
      userId = result.insertId;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new AppError(409, 'email_taken', 'That email already has an account.', {
          email: 'That email already has an account.',
        });
      }
      throw error;
    }

    try {
      await issueOtp(userId, email);
    } catch (error) {
      // The account exists; resend-otp can retry delivery.
      console.error('OTP email failed:', error.message);
    }

    res.status(201).json({ status: 'otp_required', email });
  },
);

router.post(
  '/verify-otp',
  limiter({ windowMs: 15 * 60 * 1000, limit: 20 }),
  validate(verifyOtpSchema),
  async (req, res) => {
    const { email, code } = req.body;

    const [rows] = await db.execute(
      `SELECT id, email, display_name, base_currency, timezone,
              email_verified_at, otp_hash, otp_attempts,
              (otp_expires_at > NOW()) AS otp_valid
         FROM users
        WHERE email = ? AND deleted_at IS NULL
        LIMIT 1`,
      [email],
    );

    const user = rows[0];

    if (!user || !user.otp_hash) {
      await verifyHash(await getDummyHash(), code);
      throw new AppError(400, 'invalid_code', 'That code does not match. Request a new one.');
    }

    if (user.email_verified_at) {
      throw new AppError(400, 'already_verified', 'This email is already verified. Sign in instead.');
    }

    if (!user.otp_valid) {
      throw new AppError(400, 'code_expired', 'That code expired. Request a new one.');
    }

    const [attempt] = await db.execute(
      'UPDATE users SET otp_attempts = otp_attempts + 1 WHERE id = ? AND otp_attempts < ?',
      [user.id, OTP_MAX_ATTEMPTS],
    );

    if (attempt.affectedRows === 0) {
      throw new AppError(429, 'too_many_attempts', 'Too many attempts. Request a new code.');
    }

    const valid = await verifyHash(user.otp_hash, code);

    if (!valid) {
      throw new AppError(400, 'invalid_code', 'That code does not match. Try again.');
    }

    await db.execute(
      `UPDATE users
          SET email_verified_at = NOW(),
              otp_hash = NULL,
              otp_expires_at = NULL,
              otp_attempts = 0,
              otp_sent_at = NULL
        WHERE id = ?`,
      [user.id],
    );

    await revokeSession(readSessionToken(req));
    await createSession(user.id, res);

    user.email_verified_at = new Date();

    res.json({ user: publicUser(user) });
  },
);

router.post(
  '/login',
  limiter({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true }),
  validate(loginSchema),
  async (req, res) => {
    const { email, password } = req.body;

    const [rows] = await db.execute(
      `SELECT id, email, password_hash, display_name, base_currency, timezone, email_verified_at
         FROM users
        WHERE email = ? AND deleted_at IS NULL
        LIMIT 1`,
      [email],
    );

    const user = rows[0];
    const passwordHash = user?.password_hash || (await getDummyHash());
    const valid = await verifyHash(passwordHash, password);

    if (!user || !valid) {
      throw new AppError(401, 'invalid_credentials', 'Email or password is incorrect.');
    }

    if (!user.email_verified_at) {
      throw new AppError(403, 'email_unverified', 'Verify your email before signing in.', {
        email: user.email,
      });
    }

    await revokeSession(readSessionToken(req));
    await createSession(user.id, res);

    res.json({ user: publicUser(user) });
  },
);

router.post(
  '/resend-otp',
  limiter({ windowMs: 15 * 60 * 1000, limit: 5 }),
  validate(resendOtpSchema),
  async (req, res) => {
    const { email } = req.body;

    const [rows] = await db.execute(
      `SELECT id, email, email_verified_at,
              (otp_sent_at IS NULL OR otp_sent_at <= DATE_SUB(NOW(), INTERVAL ${OTP_RESEND_COOLDOWN_SECONDS} SECOND)) AS can_send
         FROM users
        WHERE email = ? AND deleted_at IS NULL
        LIMIT 1`,
      [email],
    );

    const user = rows[0];

    if (user && !user.email_verified_at && user.can_send) {
      try {
        await issueOtp(user.id, user.email);
      } catch (error) {
        console.error('OTP email failed:', error.message);
      }
    }

    res.json({ sent: true });
  },
);

router.post('/logout', async (req, res) => {
  try {
    await revokeSession(readSessionToken(req));
  } catch (error) {
    console.error('Session revoke failed:', error.message);
  }

  clearSessionCookie(res);
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
