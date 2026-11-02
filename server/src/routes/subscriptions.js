import express from 'express';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { isValidDateKey, todayKey } from '../lib/dates.js';
import { AppError } from '../middleware/error.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';

const BILLING_CYCLES = ['weekly', 'monthly', 'quarterly', 'yearly'];
const MAX_CENTS = 1e15;

const idSchema = z
  .number()
  .int('Use a whole number.')
  .positive('Choose a valid record.')
  .max(2_147_483_647, 'Choose a valid record.');

const dateKeySchema = z
  .string()
  .trim()
  .refine(isValidDateKey, 'Choose a valid due date.');

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name the subscription.').max(100, 'Name is too long.'),
  amount_cents: z
    .number()
    .int('Use whole cents.')
    .positive('Enter an amount greater than zero.')
    .max(MAX_CENTS, 'That amount is too large.'),
  billing_cycle: z.enum(BILLING_CYCLES, { error: 'Pick a valid billing cycle.' }).default('monthly'),
  next_due_date: dateKeySchema.optional(),
  account_id: idSchema.nullable().optional(),
  category_id: idSchema.nullable().optional(),
  is_active: z.union([z.boolean(), z.literal(0), z.literal(1)]).default(1),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name the subscription.').max(100, 'Name is too long.').optional(),
    amount_cents: z
      .number()
      .int('Use whole cents.')
      .positive('Enter an amount greater than zero.')
      .max(MAX_CENTS, 'That amount is too large.')
      .optional(),
    billing_cycle: z.enum(BILLING_CYCLES, { error: 'Pick a valid billing cycle.' }).optional(),
    next_due_date: dateKeySchema.optional(),
    account_id: idSchema.nullable().optional(),
    category_id: idSchema.nullable().optional(),
    is_active: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
  })
  .refine((values) => Object.values(values).some((value) => value !== undefined), {
    message: 'Nothing to update.',
  });

const SELECT_SUBSCRIPTION = `
  SELECT id, user_id, name, amount_cents, currency, billing_cycle,
         DATE_FORMAT(next_due_date, '%Y-%m-%d') AS next_due_date,
         account_id, category_id, is_active, created_at, deleted_at
    FROM subscriptions
`;

const SELECT_SUBSCRIPTION_ROWS = `
  SELECT s.id, s.user_id, s.name, s.amount_cents, s.currency, s.billing_cycle,
         DATE_FORMAT(s.next_due_date, '%Y-%m-%d') AS next_due_date,
         s.account_id, s.category_id, s.is_active, s.created_at, s.deleted_at,
         a.name AS account_name, c.name AS category_name
    FROM subscriptions s
    LEFT JOIN accounts a ON a.id = s.account_id
    LEFT JOIN categories c ON c.id = s.category_id
   WHERE s.user_id = ? AND s.deleted_at IS NULL
`;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toSubscription(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    amount_cents: Number(row.amount_cents),
    currency: row.currency,
    billing_cycle: row.billing_cycle,
    next_due_date: row.next_due_date,
    account_id: row.account_id,
    category_id: row.category_id,
    is_active: row.is_active,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
  };
}

function toSubscriptionRow(row) {
  return {
    ...toSubscription(row),
    account_name: row.account_name ?? null,
    category_name: row.category_name ?? null,
  };
}

async function findSubscription(id, userId) {
  const [rows] = await db.execute(
    `${SELECT_SUBSCRIPTION} WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id, userId],
  );

  return rows[0] ? toSubscription(rows[0]) : null;
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

async function requireCategory(id, userId) {
  const [rows] = await db.execute(
    'SELECT id FROM categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
    [id, userId],
  );

  if (!rows.length) {
    throw new AppError(400, 'invalid_input', 'Choose a valid category.', {
      category_id: 'Choose a valid category.',
    });
  }
}

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const [rows] = await db.execute(
    `${SELECT_SUBSCRIPTION_ROWS} ORDER BY s.next_due_date, s.id`,
    [req.user.id],
  );

  res.json(rows.map(toSubscriptionRow));
});

router.post('/', validate(createSchema), async (req, res) => {
  const { name, amount_cents: amountCents, billing_cycle: billingCycle, is_active: isActive } = req.body;
  const accountId = req.body.account_id ?? null;
  const categoryId = req.body.category_id ?? null;

  if (accountId !== null) await requireAccount(accountId, req.user.id);
  if (categoryId !== null) await requireCategory(categoryId, req.user.id);

  const [result] = await db.execute(
    `INSERT INTO subscriptions
       (user_id, name, amount_cents, currency, billing_cycle, next_due_date, account_id, category_id, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      name,
      amountCents,
      req.user.base_currency || 'PHP',
      billingCycle,
      req.body.next_due_date ?? todayKey(),
      accountId,
      categoryId,
      isActive ? 1 : 0,
    ],
  );

  res.status(201).json(await findSubscription(result.insertId, req.user.id));
});

router.patch('/:id', validate(updateSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'not_found', 'Subscription not found.');

  const existing = await findSubscription(id, req.user.id);
  if (!existing) throw new AppError(404, 'not_found', 'Subscription not found.');

  if (req.body.account_id !== undefined && req.body.account_id !== null) {
    await requireAccount(req.body.account_id, req.user.id);
  }

  if (req.body.category_id !== undefined && req.body.category_id !== null) {
    await requireCategory(req.body.category_id, req.user.id);
  }

  const fields = [];
  const values = [];

  for (const [column, value] of [
    ['name', req.body.name],
    ['amount_cents', req.body.amount_cents],
    ['billing_cycle', req.body.billing_cycle],
    ['next_due_date', req.body.next_due_date],
    ['account_id', req.body.account_id],
    ['category_id', req.body.category_id],
    ['is_active', req.body.is_active === undefined ? undefined : req.body.is_active ? 1 : 0],
  ]) {
    if (value !== undefined) {
      fields.push(`${column} = ?`);
      values.push(value);
    }
  }

  await db.execute(
    `UPDATE subscriptions SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
    [...values, id, req.user.id],
  );

  res.json(await findSubscription(id, req.user.id));
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'not_found', 'Subscription not found.');

  const subscription = await findSubscription(id, req.user.id);
  if (!subscription) throw new AppError(404, 'not_found', 'Subscription not found.');

  await db.execute('UPDATE subscriptions SET deleted_at = NOW() WHERE id = ? AND user_id = ?', [
    id,
    req.user.id,
  ]);

  res.status(204).end();
});

export default router;
