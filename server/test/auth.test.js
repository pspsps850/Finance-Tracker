import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import argon2 from '@node-rs/argon2';
import request from 'supertest';
import app from '../src/app.js';
import { closePool, db, verifyConnection } from '../src/db/pool.js';

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'ft_sid';
const PASSWORD = 'test-password-123';
const createdEmails = new Set();

function uniqueEmail(label) {
  const email = `auth-test-${label}-${Date.now()}-${randomBytes(4).toString('hex')}@example.test`;
  createdEmails.add(email);
  return email;
}

async function insertUser({
  email,
  verified = false,
  otpCode = null,
  otpExpiresInMinutes = 10,
  otpAttempts = 0,
}) {
  const passwordHash = await argon2.hash(PASSWORD);
  const [result] = await db.execute(
    `INSERT INTO users (email, password_hash, display_name, email_verified_at, otp_attempts)
     VALUES (?, ?, 'Test User', ?, ?)`,
    [email, passwordHash, verified ? new Date() : null, otpAttempts],
  );

  if (otpCode) {
    const otpHash = await argon2.hash(otpCode);
    await db.execute(
      `UPDATE users
          SET otp_hash = ?,
              otp_expires_at = TIMESTAMPADD(MINUTE, ?, NOW()),
              otp_sent_at = NOW()
        WHERE id = ?`,
      [otpHash, otpExpiresInMinutes, result.insertId],
    );
  }

  return result.insertId;
}

before(async () => {
  await verifyConnection();
});

after(async () => {
  if (createdEmails.size) {
    const emails = [...createdEmails];
    const placeholders = emails.map(() => '?').join(', ');
    await db.execute(`DELETE FROM users WHERE email IN (${placeholders})`, emails);
  }

  await closePool();
});

test('health endpoint responds', async () => {
  const response = await request(app).get('/api/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('me without a session is unauthorized', async () => {
  const response = await request(app).get('/api/auth/me');

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'unauthorized');
});

test('register rejects invalid input before touching the database', async () => {
  const response = await request(app).post('/api/auth/register').send({
    display_name: '',
    email: 'not-an-email',
    password: 'short',
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'invalid_input');
  assert.ok(response.body.error.fields.email);
  assert.ok(response.body.error.fields.password);
});

test('register rejects a duplicate email', async () => {
  const email = uniqueEmail('duplicate');
  await insertUser({ email, verified: true });

  const response = await request(app).post('/api/auth/register').send({
    display_name: 'Duplicate',
    email,
    password: PASSWORD,
  });

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'email_taken');
});

test('verify-otp creates a session, and logout revokes it', async () => {
  const email = uniqueEmail('verify');
  await insertUser({ email, otpCode: '123456' });
  const agent = request.agent(app);

  const verify = await agent.post('/api/auth/verify-otp').send({ email, code: '123456' });

  assert.equal(verify.status, 200);
  assert.equal(verify.body.user.email, email);
  assert.match(verify.headers['set-cookie'][0], new RegExp(`${COOKIE_NAME}=`));

  const me = await agent.get('/api/auth/me');

  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, email);
  assert.ok(me.body.user.email_verified_at);

  const logout = await agent.post('/api/auth/logout');

  assert.equal(logout.status, 204);

  const afterLogout = await agent.get('/api/auth/me');

  assert.equal(afterLogout.status, 401);
  assert.equal(afterLogout.body.error.code, 'unauthorized');
});

test('verify-otp blocks the correct code after five wrong attempts', async () => {
  const email = uniqueEmail('attempts');
  await insertUser({ email, otpCode: '654321' });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email, code: '000000' });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'invalid_code');
  }

  const blocked = await request(app)
    .post('/api/auth/verify-otp')
    .send({ email, code: '654321' });

  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'too_many_attempts');
});

test('verify-otp rejects an expired code', async () => {
  const email = uniqueEmail('expired');
  await insertUser({ email, otpCode: '111111', otpExpiresInMinutes: -1 });

  const response = await request(app)
    .post('/api/auth/verify-otp')
    .send({ email, code: '111111' });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'code_expired');
});

test('login rejects an unverified account', async () => {
  const email = uniqueEmail('unverified');
  await insertUser({ email });

  const response = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'email_unverified');
});

test('login uses one generic error for a wrong password', async () => {
  const email = uniqueEmail('wrong-password');
  await insertUser({ email, verified: true });

  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'definitely-wrong' });

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'invalid_credentials');
});

test('login creates a session for a verified account', async () => {
  const email = uniqueEmail('login');
  await insertUser({ email, verified: true });
  const agent = request.agent(app);

  const login = await agent.post('/api/auth/login').send({ email, password: PASSWORD });

  assert.equal(login.status, 200);
  assert.equal(login.body.user.email, email);

  const me = await agent.get('/api/auth/me');

  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, email);
});

test('an expired session is rejected', async () => {
  const email = uniqueEmail('expired-session');
  const userId = await insertUser({ email, verified: true });
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  await db.execute(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES (?, ?, TIMESTAMPADD(MINUTE, -1, NOW()))`,
    [userId, tokenHash],
  );

  const response = await request(app)
    .get('/api/auth/me')
    .set('Cookie', `${COOKIE_NAME}=${token}`);

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'unauthorized');
});

test('resend-otp stays generic for an unknown email', async () => {
  const response = await request(app)
    .post('/api/auth/resend-otp')
    .send({ email: uniqueEmail('unknown') });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { sent: true });
});
