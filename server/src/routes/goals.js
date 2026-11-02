import express from 'express';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { toMysqlDateTime, isValidDateKey } from '../lib/dates.js';
import { AppError } from '../middleware/error.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';

const GOAL_STATUSES = ['active', 'achieved', 'archived'];
const MAX_CENTS = 1e15;

const idSchema = z
  .number()
  .int('Use a whole number.')
  .positive('Choose a valid record.')
  .max(2_147_483_647, 'Choose a valid record.');

const targetCentsSchema = z
  .number()
  .int('Use whole cents.')
  .positive('Set a target greater than zero.')
  .max(MAX_CENTS, 'That amount is too large.');

const dateKeySchema = z
  .string()
  .trim()
  .refine(isValidDateKey, 'Enter a valid date.');

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name the goal.').max(100, 'Name is too long.'),
  target_cents: targetCentsSchema,
  target_date: dateKeySchema.nullable().optional(),
  linked_account_id: idSchema.nullable().optional(),
  status: z.enum(GOAL_STATUSES, { error: 'Pick a valid goal status.' }).default('active'),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name the goal.').max(100, 'Name is too long.').optional(),
    target_cents: targetCentsSchema.nullable().optional(),
    target_date: dateKeySchema.nullable().optional(),
    linked_account_id: idSchema.nullable().optional(),
    status: z.enum(GOAL_STATUSES, { error: 'Pick a valid goal status.' }).optional(),
  })
  .refine((values) => Object.values(values).some((value) => value !== undefined), {
    message: 'Nothing to update.',
  });

const allocationSchema = z.object({
  account_id: idSchema,
  amount_cents: z
    .number()
    .int('Use whole cents.')
    .positive('Enter an amount greater than zero.')
    .max(MAX_CENTS, 'That amount is too large.'),
  allocated_at: z
    .string()
    .trim()
    .refine((value) => toMysqlDateTime(value) !== null, 'Enter a valid date and time.')
    .optional(),
  note: z.string().trim().max(500, 'Note is too long.').nullable().optional(),
});

const SELECT_GOAL = `
  SELECT id, user_id, name, target_cents, DATE_FORMAT(target_date, '%Y-%m-%d') AS target_date,
         linked_account_id, status, created_at, deleted_at
    FROM goals
`;

const SELECT_GOAL_ROWS = `
  SELECT g.id, g.user_id, g.name, g.target_cents,
         DATE_FORMAT(g.target_date, '%Y-%m-%d') AS target_date,
         g.linked_account_id, g.status, g.created_at, g.deleted_at,
         COALESCE(SUM(ga.amount_cents), 0) AS allocated_cents,
         COUNT(ga.id) AS allocation_count,
         a.name AS linked_account_name
    FROM goals g
    LEFT JOIN goal_allocations ga ON ga.goal_id = g.id AND ga.deleted_at IS NULL
    LEFT JOIN accounts a ON a.id = g.linked_account_id
   WHERE g.user_id = ? AND g.deleted_at IS NULL
   GROUP BY g.id, a.name
`;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toGoal(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    target_cents: row.target_cents === null ? null : Number(row.target_cents),
    target_date: row.target_date,
    linked_account_id: row.linked_account_id,
    status: row.status,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
  };
}

function toGoalRow(row) {
  const target = row.target_cents === null ? null : Number(row.target_cents);
  const allocated = Number(row.allocated_cents);

  return {
    ...toGoal(row),
    allocated_cents: allocated,
    progress_pct: target && target > 0 ? Math.min(999, Math.round((allocated / target) * 100)) : null,
    linked_account_name: row.linked_account_name ?? null,
    allocation_count: Number(row.allocation_count),
  };
}

async function findGoal(id, userId) {
  const [rows] = await db.execute(
    `${SELECT_GOAL} WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id, userId],
  );

  return rows[0] ? toGoal(rows[0]) : null;
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
    `${SELECT_GOAL_ROWS}
      ORDER BY (g.status = 'active') DESC, g.id`,
    [req.user.id],
  );

  res.json(rows.map(toGoalRow));
});

router.post('/', validate(createSchema), async (req, res) => {
  const { name, target_cents: targetCents, target_date: targetDate, linked_account_id: linkedAccountId, status } =
    req.body;

  if (linkedAccountId !== null && linkedAccountId !== undefined) {
    await requireAccount(linkedAccountId, req.user.id);
  }

  const [result] = await db.execute(
    `INSERT INTO goals (user_id, name, target_cents, target_date, linked_account_id, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, name, targetCents, targetDate ?? null, linkedAccountId ?? null, status],
  );

  res.status(201).json(await findGoal(result.insertId, req.user.id));
});

router.patch('/:id', validate(updateSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'not_found', 'Goal not found.');

  const existing = await findGoal(id, req.user.id);
  if (!existing) throw new AppError(404, 'not_found', 'Goal not found.');

  if (req.body.linked_account_id !== undefined && req.body.linked_account_id !== null) {
    await requireAccount(req.body.linked_account_id, req.user.id);
  }

  const fields = [];
  const values = [];

  for (const [column, value] of [
    ['name', req.body.name],
    ['target_cents', req.body.target_cents],
    ['target_date', req.body.target_date],
    ['linked_account_id', req.body.linked_account_id],
    ['status', req.body.status],
  ]) {
    if (value !== undefined) {
      fields.push(`${column} = ?`);
      values.push(value);
    }
  }

  await db.execute(
    `UPDATE goals SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
    [...values, id, req.user.id],
  );

  res.json(await findGoal(id, req.user.id));
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'not_found', 'Goal not found.');

  const goal = await findGoal(id, req.user.id);
  if (!goal) throw new AppError(404, 'not_found', 'Goal not found.');

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      'UPDATE goal_allocations SET deleted_at = NOW() WHERE goal_id = ? AND user_id = ? AND deleted_at IS NULL',
      [id, req.user.id],
    );

    await connection.execute('UPDATE goals SET deleted_at = NOW() WHERE id = ? AND user_id = ?', [
      id,
      req.user.id,
    ]);

    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original error.
    }
    throw error;
  } finally {
    connection.release();
  }

  res.status(204).end();
});

router.post('/:id/allocations', validate(allocationSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'not_found', 'Goal not found.');

  const goal = await findGoal(id, req.user.id);
  if (!goal) throw new AppError(404, 'not_found', 'Goal not found.');

  const { account_id: accountId, amount_cents: amountCents, note } = req.body;

  await requireAccount(accountId, req.user.id);

  const allocatedAt = toMysqlDateTime(req.body.allocated_at ?? new Date());

  const [result] = await db.execute(
    `INSERT INTO goal_allocations (user_id, goal_id, account_id, amount_cents, allocated_at, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, id, accountId, amountCents, allocatedAt, note || null],
  );

  const [rows] = await db.execute(
    `SELECT id, user_id, goal_id, account_id, amount_cents, allocated_at, note, deleted_at
       FROM goal_allocations
      WHERE id = ? AND user_id = ? LIMIT 1`,
    [result.insertId, req.user.id],
  );

  res.status(201).json(rows[0] ?? null);
});

export default router;
