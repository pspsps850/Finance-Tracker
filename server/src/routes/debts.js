import express from 'express';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { AppError } from '../middleware/error.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';

const MAX_CENTS = 1e15;
const MAX_RATE_BPS = 1_000_000;

const idSchema = z
  .number()
  .int('Use a whole number.')
  .positive('Choose a valid record.')
  .max(2_147_483_647, 'Choose a valid record.');

const principalSchema = z
  .number()
  .int('Use whole cents.')
  .positive('Enter the original amount.')
  .max(MAX_CENTS, 'That amount is too large.');

const balanceSchema = z
  .number()
  .int('Use whole cents.')
  .min(0, 'Enter a balance of zero or more.')
  .max(MAX_CENTS, 'That amount is too large.');

const paymentSchema = z
  .number()
  .int('Use whole cents.')
  .min(0, 'Enter a payment of zero or more.')
  .max(MAX_CENTS, 'That amount is too large.');

const rateSchema = z
  .number()
  .int('Use whole basis points.')
  .min(0, 'Enter a rate of zero or more.')
  .max(MAX_RATE_BPS, 'That rate is too large.');

const dueDaySchema = z
  .number()
  .int('Use a whole day.')
  .min(1, 'Use a day between 1 and 31.')
  .max(31, 'Use a day between 1 and 31.')
  .nullable();

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name the debt.').max(100, 'Name is too long.'),
  account_id: idSchema.nullable().optional(),
  principal_cents: principalSchema,
  current_balance_cents: balanceSchema,
  interest_rate_bps: rateSchema.default(0),
  minimum_payment_cents: paymentSchema.default(0),
  due_day: dueDaySchema.optional(),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name the debt.').max(100, 'Name is too long.').optional(),
    account_id: idSchema.nullable().optional(),
    principal_cents: principalSchema.optional(),
    current_balance_cents: balanceSchema.optional(),
    interest_rate_bps: rateSchema.optional(),
    minimum_payment_cents: paymentSchema.optional(),
    due_day: dueDaySchema.optional(),
  })
  .refine((values) => Object.values(values).some((value) => value !== undefined), {
    message: 'Nothing to update.',
  });

const SELECT_DEBT = `
  SELECT id, user_id, name, account_id, principal_cents, current_balance_cents,
         interest_rate_bps, minimum_payment_cents, due_day, created_at, deleted_at
    FROM debts
`;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toDebt(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    account_id: row.account_id,
    principal_cents: Number(row.principal_cents),
    current_balance_cents: Number(row.current_balance_cents),
    interest_rate_bps: Number(row.interest_rate_bps),
    minimum_payment_cents: Number(row.minimum_payment_cents),
    due_day: row.due_day === null ? null : Number(row.due_day),
    created_at: row.created_at,
    deleted_at: row.deleted_at,
  };
}

async function findDebt(id, userId) {
  const [rows] = await db.execute(
    `${SELECT_DEBT} WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id, userId],
  );

  return rows[0] ? toDebt(rows[0]) : null;
}

async function requireAccount(id, userId) {
  const [rows] = await db.execute(
    'SELECT id FROM accounts WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
    [id, userId],
  );

  if (!rows.length) {
    throw new AppError(400, 'invalid_input', 'Choose a valid account.', {
      account_id: 'Choose a valid account.',
    });
  }
}

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const [rows] = await db.execute(
    `${SELECT_DEBT}
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY current_balance_cents DESC, id`,
    [req.user.id],
  );

  res.json(rows.map(toDebt));
});

router.post('/', validate(createSchema), async (req, res) => {
  const { name, principal_cents: principalCents, current_balance_cents: balanceCents } = req.body;
  const accountId = req.body.account_id ?? null;

  if (accountId !== null) await requireAccount(accountId, req.user.id);

  const [result] = await db.execute(
    `INSERT INTO debts
       (user_id, name, account_id, principal_cents, current_balance_cents,
        interest_rate_bps, minimum_payment_cents, due_day)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      name,
      accountId,
      principalCents,
      balanceCents,
      req.body.interest_rate_bps,
      req.body.minimum_payment_cents,
      req.body.due_day ?? null,
    ],
  );

  res.status(201).json(await findDebt(result.insertId, req.user.id));
});

router.patch('/:id', validate(updateSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'not_found', 'Debt not found.');

  const existing = await findDebt(id, req.user.id);
  if (!existing) throw new AppError(404, 'not_found', 'Debt not found.');

  if (req.body.account_id !== undefined && req.body.account_id !== null) {
    await requireAccount(req.body.account_id, req.user.id);
  }

  const fields = [];
  const values = [];

  for (const [column, value] of [
    ['name', req.body.name],
    ['account_id', req.body.account_id],
    ['principal_cents', req.body.principal_cents],
    ['current_balance_cents', req.body.current_balance_cents],
    ['interest_rate_bps', req.body.interest_rate_bps],
    ['minimum_payment_cents', req.body.minimum_payment_cents],
    ['due_day', req.body.due_day],
  ]) {
    if (value !== undefined) {
      fields.push(`${column} = ?`);
      values.push(value);
    }
  }

  await db.execute(
    `UPDATE debts SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
    [...values, id, req.user.id],
  );

  res.json(await findDebt(id, req.user.id));
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'not_found', 'Debt not found.');

  const debt = await findDebt(id, req.user.id);
  if (!debt) throw new AppError(404, 'not_found', 'Debt not found.');

  await db.execute('UPDATE debts SET deleted_at = NOW() WHERE id = ? AND user_id = ?', [
    id,
    req.user.id,
  ]);

  res.status(204).end();
});

export default router;
