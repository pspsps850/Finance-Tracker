import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { isValidDateKey, toMysqlDateTime } from '../lib/dates.js';
import { AppError } from '../middleware/error.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';

const MAX_CENTS = 1e15;
const MAX_DESCRIPTION = 500;

const idSchema = z
  .number()
  .int('Use a whole number.')
  .positive('Choose a valid record.')
  .max(2_147_483_647, 'Choose a valid record.');

const amountSchema = z
  .number()
  .int('Use whole cents.')
  .min(-MAX_CENTS, 'That amount is too large.')
  .max(MAX_CENTS, 'That amount is too large.')
  .refine((value) => value !== 0, 'Amount cannot be zero.');

const descriptionSchema = z
  .string()
  .trim()
  .max(MAX_DESCRIPTION, 'Description is too long.')
  .nullable()
  .optional();

const occurredAtSchema = z
  .string()
  .trim()
  .min(1, 'Choose when it happened.')
  .refine((value) => toMysqlDateTime(value) !== null, 'Enter a valid date and time.');

const createSchema = z.object({
  account_id: idSchema,
  category_id: idSchema.nullable().optional(),
  amount_cents: amountSchema,
  occurred_at: occurredAtSchema.optional(),
  description: descriptionSchema,
});

const updateSchema = z
  .object({
    account_id: idSchema.optional(),
    category_id: idSchema.nullable().optional(),
    amount_cents: amountSchema.optional(),
    occurred_at: occurredAtSchema.optional(),
    description: descriptionSchema,
  })
  .refine((values) => Object.values(values).some((value) => value !== undefined), {
    message: 'Nothing to update.',
  });

const transferSchema = z
  .object({
    from_account_id: idSchema,
    to_account_id: idSchema,
    amount_cents: z
      .number()
      .int('Use whole cents.')
      .positive('Enter an amount greater than zero.')
      .max(MAX_CENTS, 'That amount is too large.'),
    occurred_at: occurredAtSchema.optional(),
    description: descriptionSchema,
  })
  .refine((values) => values.from_account_id !== values.to_account_id, {
    message: 'Choose two different accounts.',
    path: ['to_account_id'],
  });

const SELECT_TRANSACTION = `
  SELECT t.id, t.user_id, t.account_id, t.category_id, t.amount_cents, t.currency,
         t.occurred_at, t.description, t.transfer_group_id, t.parent_transaction_id,
         t.created_at, t.deleted_at,
         a.name AS account_name, a.type AS account_type,
         c.name AS category_name, c.color AS category_color, c.type AS category_type
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
`;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toTransaction(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    account_id: row.account_id,
    category_id: row.category_id,
    amount_cents: Number(row.amount_cents),
    currency: row.currency,
    occurred_at: row.occurred_at,
    description: row.description,
    transfer_group_id: row.transfer_group_id,
    parent_transaction_id: row.parent_transaction_id,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
    account_name: row.account_name,
    account_type: row.account_type,
    category_name: row.category_name ?? null,
    category_color: row.category_color ?? null,
    category_type: row.category_type ?? null,
  };
}

async function findTransaction(id, userId, executor = db) {
  const [rows] = await executor.execute(
    `${SELECT_TRANSACTION} WHERE t.id = ? AND t.user_id = ? AND t.deleted_at IS NULL LIMIT 1`,
    [id, userId],
  );

  return rows[0] ? toTransaction(rows[0]) : null;
}

async function requireAccount(id, userId, field = 'account_id') {
  const [rows] = await db.execute(
    'SELECT id FROM accounts WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
    [id, userId],
  );

  if (!rows.length) {
    throw new AppError(400, 'invalid_input', 'Choose a valid account.', {
      [field]: 'Choose a valid account.',
    });
  }
}

async function requireCategory(id, userId, field = 'category_id') {
  if (id === null || id === undefined) return;

  const [rows] = await db.execute(
    'SELECT id FROM categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
    [id, userId],
  );

  if (!rows.length) {
    throw new AppError(400, 'invalid_input', 'Choose a valid category.', {
      [field]: 'Choose a valid category.',
    });
  }
}

function queryText(value, field) {
  if (value === undefined || value === '') return undefined;

  if (typeof value !== 'string') {
    throw new AppError(400, 'invalid_input', `Invalid ${field}.`, { [field]: 'Use text.' });
  }

  const text = value.trim();

  if (text.length > 100) {
    throw new AppError(400, 'invalid_input', 'Search text is too long.', {
      [field]: 'Use 100 characters or fewer.',
    });
  }

  return text || undefined;
}

function queryInt(value, field, { fallback, min, max }) {
  if (value === undefined || value === '') return fallback;

  const number = Number(value);

  if (!Number.isInteger(number)) {
    throw new AppError(400, 'invalid_input', `Invalid ${field}.`, {
      [field]: 'Use a whole number.',
    });
  }

  return Math.min(max, Math.max(min, number));
}

function queryId(value, field) {
  if (value === undefined || value === '') return undefined;

  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'invalid_input', `Invalid ${field}.`, {
      [field]: 'Choose a valid value.',
    });
  }

  return id;
}

function queryDate(value, field) {
  if (value === undefined || value === '') return undefined;

  if (typeof value !== 'string' || !isValidDateKey(value)) {
    throw new AppError(400, 'invalid_input', `Invalid ${field}.`, {
      [field]: 'Use YYYY-MM-DD.',
    });
  }

  return value;
}

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const page = queryInt(req.query.page, 'page', {
    fallback: 1,
    min: 1,
    max: 1_000_000_000,
  });
  const pageSize = queryInt(req.query.page_size, 'page_size', {
    fallback: 20,
    min: 1,
    max: 100,
  });
  const from = queryDate(req.query.from, 'from');
  const to = queryDate(req.query.to, 'to');
  const accountId = queryId(req.query.account_id, 'account_id');
  const categoryId = queryId(req.query.category_id, 'category_id');
  const search = queryText(req.query.q, 'q');

  const where = ['t.user_id = ?', 't.deleted_at IS NULL'];
  const params = [req.user.id];

  if (from) {
    where.push('t.occurred_at >= ?');
    params.push(from);
  }

  if (to) {
    where.push('t.occurred_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(to);
  }

  if (accountId) {
    where.push('t.account_id = ?');
    params.push(accountId);
  }

  if (categoryId) {
    where.push('t.category_id = ?');
    params.push(categoryId);
  }

  if (search) {
    where.push("LOCATE(LOWER(?), LOWER(CONCAT_WS(' ', t.description, a.name, c.name))) > 0");
    params.push(search);
  }

  const whereSql = where.join(' AND ');

  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE ${whereSql}`,
    params,
  );

  const total = Number(countRows[0].total);
  const offset = (page - 1) * pageSize;

  const [rows] = await db.execute(
    `${SELECT_TRANSACTION}
      WHERE ${whereSql}
      ORDER BY t.occurred_at DESC, t.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  res.json({
    items: rows.map(toTransaction),
    total,
    page,
    page_size: pageSize,
  });
});

router.post('/', validate(createSchema), async (req, res) => {
  const {
    account_id: accountId,
    category_id: categoryId,
    amount_cents: amountCents,
    description,
  } = req.body;

  await requireAccount(accountId, req.user.id);
  await requireCategory(categoryId, req.user.id);

  const [result] = await db.execute(
    `INSERT INTO transactions
       (user_id, account_id, category_id, amount_cents, currency, occurred_at, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      accountId,
      categoryId ?? null,
      amountCents,
      req.user.base_currency || 'PHP',
      toMysqlDateTime(req.body.occurred_at ?? new Date()),
      description ?? '',
    ],
  );

  res.status(201).json(await findTransaction(result.insertId, req.user.id));
});

router.patch('/:id', validate(updateSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'not_found', 'Transaction not found.');

  const existing = await findTransaction(id, req.user.id);
  if (!existing) throw new AppError(404, 'not_found', 'Transaction not found.');

  if (existing.transfer_group_id) {
    throw new AppError(409, 'transfer_locked', 'Transfers can only be deleted, not edited.');
  }

  if (req.body.account_id !== undefined) {
    await requireAccount(req.body.account_id, req.user.id);
  }

  if (req.body.category_id !== undefined && req.body.category_id !== null) {
    await requireCategory(req.body.category_id, req.user.id);
  }

  const fields = [];
  const values = [];

  for (const [column, value] of [
    ['account_id', req.body.account_id],
    ['category_id', req.body.category_id],
    ['amount_cents', req.body.amount_cents],
    ['occurred_at', req.body.occurred_at === undefined ? undefined : toMysqlDateTime(req.body.occurred_at)],
    ['description', req.body.description === undefined ? undefined : req.body.description ?? ''],
  ]) {
    if (value !== undefined) {
      fields.push(`${column} = ?`);
      values.push(value);
    }
  }

  await db.execute(
    `UPDATE transactions SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
    [...values, id, req.user.id],
  );

  res.json(await findTransaction(id, req.user.id));
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'not_found', 'Transaction not found.');

  const transaction = await findTransaction(id, req.user.id);
  if (!transaction) throw new AppError(404, 'not_found', 'Transaction not found.');

  if (transaction.transfer_group_id) {
    await db.execute(
      'UPDATE transactions SET deleted_at = NOW() WHERE transfer_group_id = ? AND user_id = ? AND deleted_at IS NULL',
      [transaction.transfer_group_id, req.user.id],
    );
  } else {
    await db.execute('UPDATE transactions SET deleted_at = NOW() WHERE id = ? AND user_id = ?', [
      id,
      req.user.id,
    ]);
  }

  res.status(204).end();
});

export const transfersRouter = express.Router();

transfersRouter.use(requireAuth);

transfersRouter.post('/', validate(transferSchema), async (req, res) => {
  const { from_account_id: fromId, to_account_id: toId, amount_cents: amountCents, description } = req.body;

  const [accounts] = await db.execute(
    `SELECT id, name
       FROM accounts
      WHERE user_id = ? AND deleted_at IS NULL AND id IN (?, ?)`,
    [req.user.id, fromId, toId],
  );

  if (accounts.length !== 2) {
    throw new AppError(404, 'not_found', 'One of the accounts no longer exists.');
  }

  const from = accounts.find((account) => account.id === fromId);
  const to = accounts.find((account) => account.id === toId);

  const transferGroupId = randomUUID();
  const occurredAt = toMysqlDateTime(req.body.occurred_at ?? new Date());
  const currency = req.user.base_currency || 'PHP';

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO transactions
         (user_id, account_id, category_id, amount_cents, currency, occurred_at, description, transfer_group_id)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        fromId,
        -amountCents,
        currency,
        occurredAt,
        description || `Transfer to ${to.name}`,
        transferGroupId,
      ],
    );

    await connection.execute(
      `INSERT INTO transactions
         (user_id, account_id, category_id, amount_cents, currency, occurred_at, description, transfer_group_id)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        toId,
        amountCents,
        currency,
        occurredAt,
        description || `Transfer from ${from.name}`,
        transferGroupId,
      ],
    );

    const [rows] = await connection.execute(
      `${SELECT_TRANSACTION}
        WHERE t.transfer_group_id = ? AND t.user_id = ?
        ORDER BY t.id`,
      [transferGroupId, req.user.id],
    );

    await connection.commit();

    res.status(201).json({
      transfer_group_id: transferGroupId,
      legs: rows.map(toTransaction),
    });
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
});

export default router;
