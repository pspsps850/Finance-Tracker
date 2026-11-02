import express from 'express';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { currentMonthKey, isValidMonthKey, monthRange } from '../lib/dates.js';
import { AppError } from '../middleware/error.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';

const MAX_CENTS = 1e15;

const idSchema = z
  .number()
  .int('Use a whole number.')
  .positive('Choose a valid category.')
  .max(2_147_483_647, 'Choose a valid category.');

const createSchema = z.object({
  category_id: idSchema,
  month: z
    .string()
    .trim()
    .refine(isValidMonthKey, 'Choose a valid month.')
    .optional(),
  limit_cents: z
    .number()
    .int('Use whole cents.')
    .positive('Set a limit greater than zero.')
    .max(MAX_CENTS, 'That amount is too large.'),
  rollover: z.union([z.boolean(), z.literal(0), z.literal(1)]).default(0),
});

const updateSchema = z
  .object({
    category_id: idSchema.optional(),
    limit_cents: z
      .number()
      .int('Use whole cents.')
      .positive('Set a limit greater than zero.')
      .max(MAX_CENTS, 'That amount is too large.')
      .optional(),
    rollover: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
  })
  .refine((values) => Object.values(values).some((value) => value !== undefined), {
    message: 'Nothing to update.',
  });

const SELECT_BUDGET = `
  SELECT id, user_id, category_id,
         DATE_FORMAT(period_start, '%Y-%m-%d') AS period_start,
         DATE_FORMAT(period_end, '%Y-%m-%d') AS period_end,
         limit_cents, rollover, created_at, deleted_at
    FROM budgets
`;

const SELECT_BUDGET_ROWS = `
  SELECT bp.budget_id AS id, bp.user_id, bp.category_id,
         DATE_FORMAT(bp.period_start, '%Y-%m-%d') AS period_start,
         DATE_FORMAT(bp.period_end, '%Y-%m-%d') AS period_end,
         bp.limit_cents, b.rollover, b.created_at, b.deleted_at,
         bp.spent_cents, bp.remaining_cents,
         c.name AS category_name, c.type AS category_type, c.color AS category_color
    FROM budget_progress bp
    JOIN budgets b ON b.id = bp.budget_id AND b.deleted_at IS NULL
    LEFT JOIN categories c ON c.id = bp.category_id
   WHERE bp.user_id = ?
`;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toBudget(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    category_id: row.category_id,
    period_start: row.period_start,
    period_end: row.period_end,
    limit_cents: Number(row.limit_cents),
    rollover: row.rollover,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
  };
}

function toBudgetRow(row) {
  const limit = Number(row.limit_cents);
  const spent = Number(row.spent_cents);

  return {
    ...toBudget(row),
    category_name: row.category_name ?? 'Deleted category',
    category_type: row.category_type ?? 'needs',
    category_color: row.category_color ?? null,
    spent_cents: spent,
    remaining_cents: Number(row.remaining_cents),
    progress_pct: limit ? Math.max(0, Math.round((spent / limit) * 100)) : 0,
  };
}

async function findBudget(id, userId) {
  const [rows] = await db.execute(
    `${SELECT_BUDGET} WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id, userId],
  );

  return rows[0] ? toBudget(rows[0]) : null;
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

async function assertUniquePeriod(categoryId, userId, range, excludeId = null) {
  const params = [userId, categoryId, range.end, range.start];
  let sql = `
    SELECT 1 FROM budgets
     WHERE user_id = ? AND category_id = ? AND deleted_at IS NULL
       AND period_start <= ? AND period_end >= ?
  `;

  if (excludeId !== null) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }

  sql += ' LIMIT 1';

  const [rows] = await db.execute(sql, params);

  if (rows.length) {
    throw new AppError(409, 'budget_exists', 'That category already has a budget for this period.', {
      category_id: 'That category already has a budget for this period.',
    });
  }
}

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const rawMonth = req.query.month;

  if (rawMonth !== undefined && (typeof rawMonth !== 'string' || !isValidMonthKey(rawMonth))) {
    throw new AppError(400, 'invalid_input', 'Choose a valid month.', {
      month: 'Use YYYY-MM.',
    });
  }

  const month = rawMonth || currentMonthKey();
  const range = monthRange(month);

  const [rows] = await db.execute(
    `${SELECT_BUDGET_ROWS}
       AND bp.period_start <= ? AND bp.period_end >= ?
      ORDER BY c.name, bp.budget_id`,
    [req.user.id, range.end, range.start],
  );

  res.json(rows.map(toBudgetRow));
});

router.post('/', validate(createSchema), async (req, res) => {
  const { category_id: categoryId, limit_cents: limitCents } = req.body;
  const month = req.body.month || currentMonthKey();
  const range = monthRange(month);

  await requireCategory(categoryId, req.user.id);
  await assertUniquePeriod(categoryId, req.user.id, range);

  const [result] = await db.execute(
    `INSERT INTO budgets (user_id, category_id, period_start, period_end, limit_cents, rollover)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, categoryId, range.start, range.end, limitCents, req.body.rollover ? 1 : 0],
  );

  res.status(201).json(await findBudget(result.insertId, req.user.id));
});

router.patch('/:id', validate(updateSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'not_found', 'Budget not found.');

  const existing = await findBudget(id, req.user.id);
  if (!existing) throw new AppError(404, 'not_found', 'Budget not found.');

  if (req.body.category_id !== undefined) {
    await requireCategory(req.body.category_id, req.user.id);
    await assertUniquePeriod(
      req.body.category_id,
      req.user.id,
      { start: existing.period_start, end: existing.period_end },
      id,
    );
  }

  const fields = [];
  const values = [];

  for (const [column, value] of [
    ['category_id', req.body.category_id],
    ['limit_cents', req.body.limit_cents],
    ['rollover', req.body.rollover === undefined ? undefined : req.body.rollover ? 1 : 0],
  ]) {
    if (value !== undefined) {
      fields.push(`${column} = ?`);
      values.push(value);
    }
  }

  await db.execute(
    `UPDATE budgets SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
    [...values, id, req.user.id],
  );

  res.json(await findBudget(id, req.user.id));
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'not_found', 'Budget not found.');

  const budget = await findBudget(id, req.user.id);
  if (!budget) throw new AppError(404, 'not_found', 'Budget not found.');

  await db.execute('UPDATE budgets SET deleted_at = NOW() WHERE id = ? AND user_id = ?', [
    id,
    req.user.id,
  ]);

  res.status(204).end();
});

export default router;
