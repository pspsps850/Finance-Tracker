import express from 'express';
import {z} from 'zod';
import {db} from '../db/pool.js';
import {AppError} from '../middleware/error.js';
import {requireAuth} from '../middleware/requireAuth.js';
import {validate} from '../middleware/validate.js';


const ACCOUNT_TYPES = ['asset', 'liability'];
const ACCOUNT_SUBTYPES = ['checking', 'savings', 'bank', 'cash', 'ewallet', 'investment', 'credit_card', 'loan', 'mortgage', 'other'];

const SUBTYPES_BY_TYPE = {
  asset: new Set(['checking', 'savings', 'bank', 'cash', 'ewallet', 'investment', 'other']),
  liability: new Set(['credit_card', 'loan', 'mortgage', 'other'])
};

const createSchema = z.object({
    name: z.string().trim().min(1, 'Give the account a name.').max(100, 'Name is too long.'),
    type: z.enum(ACCOUNT_TYPES, { error: 'Pick asset or liability'}),
    subtype: z.enum(ACCOUNT_SUBTYPES, { error: 'Pick a valid account subtype'}),
    opening_balance_cents: z.number().int('Use whole cents.').min(-1e15).max(1e15).default(0),
    is_active: z.union([z.boolean(), z.literal(0), z.literal(1)]).default(1)
});

const updateSchema = z.object({
    name: z.string().trim().min(1, 'Give the account a name.').max(100, 'Name is too long.').optional(),
    type: z.enum(ACCOUNT_TYPES, { error: 'Pick asset or liability'}).optional(),
    subtype: z.enum(ACCOUNT_SUBTYPES, { error: 'Pick a valid account subtype'}).optional(),
    opening_balance_cents: z.number().int('Use whole cents.').min(-1e15).max(1e15).optional(),
    is_active: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional()
})
.refine((values) => Object.values(values).some((value) => value !== undefined),{
    message: 'Nothing to update.'
});

const REFERENCED_SQL = `
    SELECT 1 FROM transactions WHERE account_id = ? and deleted_at IS NULL
    UNION ALL
    SELECT 1 FROM goal_allocations WHERE account_id = ? and deleted_at IS NULL
    UNION ALL
    SELECT 1 FROM goals WHERE linked_account_id = ? and deleted_at IS NULL
    UNION ALL
    SELECT 1 FROM subscriptions WHERE account_id = ? and deleted_at IS NULL
    UNION ALL
    SELECT 1 FROM debts WHERE account_id = ? and deleted_at IS NULL
    LIMIT 1`;


const SELECT_ACCOUNT = `
     SELECT a.id, a.user_id, a.name, a.type, a.subtype, a.currency,
          a.opening_balance_cents, a.is_active, a.created_at, a.deleted_at,
          CASE WHEN a.type = 'liability'
               THEN a.opening_balance_cents - COALESCE(SUM(t.amount_cents), 0)
               ELSE a.opening_balance_cents + COALESCE(SUM(t.amount_cents), 0)
          END AS balance_cents
     FROM accounts a
     LEFT JOIN transactions t ON t.account_id = a.id AND t.deleted_at IS NULL
    WHERE a.user_id = ? AND a.deleted_at IS NULL
`;


function parseId(value){
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function assertPair(type, subtype){
    if(!SUBTYPES_BY_TYPE[type]?.has(subtype)){
        throw new AppError(400, 'invalid_input', 'That subtype does not fit the account type.',{
            subtype: 'Pick a subtype that matches the account type.'
        });
    }
}


function toAccountRow(row){
    return {
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        type: row.type,
        subtype: row.subtype,
        currency: row.currency,
        opening_balance_cents: Number(row.opening_balance_cents),
        balance_cents: Number(row.balance_cents),
        is_active: row.is_active,
        created_at: row.created_at,
        deleted_at: row.deleted_at
    };
}

async function findAccount(id, userId){
    const [rows] = await db.execute(`${SELECT_ACCOUNT} AND a.id = ? GROUP BY a.id LIMIT 1`, [userId, id]);
    return rows[0] ? toAccountRow(rows[0]) : null;
}

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
   const [rows] = await db.execute(`${SELECT_ACCOUNT} GROUP BY a.id ORDER BY a.type, a.name, a.id`, [req.user.id]); 
   res.json(rows.map(toAccountRow));
});

router.post('/', validate(createSchema), async (req, res) => {
  const {
    name, type, subtype,
    opening_balance_cents: openingBalance,
    is_active: isActive,
  } = req.body;

  assertPair(type, subtype);

  try {
    const [result] = await db.execute(
      `INSERT INTO accounts
         (user_id, name, type, subtype, currency, opening_balance_cents, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id, name, type, subtype,
        req.user.base_currency || 'PHP',
        openingBalance,
        isActive ? 1 : 0,
      ],
    );

    res.status(201).json(await findAccount(result.insertId, req.user.id));
  } catch (error) {
    // DB CHECK constraint is stricter than the API enum until the migration lands.
    if (error.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
      throw new AppError(400, 'invalid_input', 'That subtype is not supported yet.', {
        subtype: 'Pick a supported subtype.',
      });
    }
    throw error;
  }
});

router.patch('/:id', validate(updateSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'not_found', 'Account not found.');

  const existing = await findAccount(id, req.user.id);
  if (!existing) throw new AppError(404, 'not_found', 'Account not found.');

  const merged = { type: existing.type, subtype: existing.subtype, ...req.body };
  assertPair(merged.type, merged.subtype);

  const fields = [];
  const values = [];

  for (const [column, value] of [
    ['name', req.body.name],
    ['type', req.body.type],
    ['subtype', req.body.subtype],
    ['opening_balance_cents', req.body.opening_balance_cents],
    ['is_active', req.body.is_active === undefined ? undefined : req.body.is_active ? 1 : 0],
  ]) {
    if (value !== undefined) {
      fields.push(`${column} = ?`);
      values.push(value);
    }
  }

  try {
    await db.execute(
      `UPDATE accounts SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      [...values, id, req.user.id],
    );
  } catch (error) {
    if (error.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
      throw new AppError(400, 'invalid_input', 'That subtype is not supported yet.', {
        subtype: 'Pick a supported subtype.',
      });
    }
    throw error;
  }

  res.json(await findAccount(id, req.user.id));
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'not_found', 'Account not found.');

  const account = await findAccount(id, req.user.id);
  if (!account) throw new AppError(404, 'not_found', 'Account not found.');

  const [referenced] = await db.execute(REFERENCED_SQL, [id, id, id, id, id]);

  if (referenced.length) {
    throw new AppError(
      409,
      'account_in_use',
      'Archive it instead — transactions, goals, subscriptions or debts still use this account.',
    );
  }

  await db.execute(
    'UPDATE accounts SET deleted_at = NOW(), is_active = 0 WHERE id = ? AND user_id = ?',
    [id, req.user.id],
  );

  res.status(204).end();
});

export default router;