import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.GMAIL_USER = '';
process.env.GMAIL_PASSWORD = '';

const { default: request } = await import('supertest');
const { default: app } = await import('../src/app.js');
const { closePool, db, verifyConnection } = await import('../src/db/pool.js');

const email = `auth-test-register-${Date.now()}-${randomBytes(4).toString('hex')}@example.test`;
const originalWarn = console.warn;
let otp = null;

console.warn = (message, ...args) => {
  const match = /OTP for .*: (\d{6})/.exec(String(message));

  if (match) otp = match[1];
  originalWarn(message, ...args);
};

after(async () => {
  console.warn = originalWarn;
  await db.execute('DELETE FROM users WHERE email = ?', [email]);
  await closePool();
});

test('register issues an OTP and verify-otp completes the flow', async () => {
  await verifyConnection();

  const agent = request.agent(app);
  const registered = await agent.post('/api/auth/register').send({
    display_name: 'New User',
    email,
    password: 'test-password-123',
  });

  assert.equal(registered.status, 201);
  assert.equal(registered.body.status, 'otp_required');
  assert.match(otp, /^\d{6}$/);

  const verified = await agent.post('/api/auth/verify-otp').send({ email, code: otp });

  assert.equal(verified.status, 200);
  assert.equal(verified.body.user.email, email);

  const me = await agent.get('/api/auth/me');

  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, email);
});
