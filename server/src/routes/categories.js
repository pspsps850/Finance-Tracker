import express from 'express';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { AppError } from '../middleware/error.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';

const CATEGORY_TYPES = ['needs', 'wants', 'savings', 'income', 'interest', 'transfer'];
const DEFAULT_COLOR = '#4f6b57';

const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour.')
  .nullable();

const parentIdSchema = z
  .number()
  .int('Use a whole number.')
  .positive('Choose a valid parent.')
  .max(2_147_483_647, 'Choose a valid parent.');

const createSchema = z.object({
  name: z.string().trim().min(1, 'Give the category a name.').max(100, 'Name is too long.'),
  type: z.enum(CATEGORY_TYPES, { error: 'Pick a valid category type.' }),
  parent_id: parentIdSchema.nullable().optional(),
  color: colorSchema.optional(),
  is_active: z.union([z.boolean(), z.literal(0), z.literal(1)]).default(1),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the category a name.').max(100, 'Name is too long.').optional(),
    type: z.enum(CATEGORY_TYPES, { error: 'Pick a valid category type.' }).optional(),
    parent_id: parentIdSchema.nullable().optional(),
    color: colorSchema.optional(),
    is_active: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
  })
  .refine((values) => Object.values(values).some((value) => value !== undefined), {
    message: 'Nothing to update.',
  });

const SELECT_CATEGORY = `
  SELECT id, user_id, name, type, parent_id, color, is_active, created_at, deleted_at
    FROM categories
`;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toCategory(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    type: row.type,
    parent_id: row.parent_id,
    color: row.color,
    is_active: row.is_active,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
  };
}

async function findCategory(id, userId) {
  const [rows] = await db.execute(
    `${SELECT_CATEGORY} WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id, userId],
  );

  return rows[0] ? toCategory(rows[0]) : null;
}

function duplicateNameError() {
  return new AppError(409, 'category_exists', 'That name is already taken, including archived categories.', {
    name: 'That name is already taken, including archived categories.',
  });
}

async function assertParent(parentId, userId, type, selfId = null) {
  if (parentId === null || parentId === undefined) return;

  if (selfId !== null && parentId === selfId) {
    throw new AppError(400, 'invalid_input', 'A category cannot be its own parent.', {
      parent_id: 'Pick a different parent.',
    });
  }

  let current = await findCategory(parentId, userId);

  if (!current) {
    throw new AppError(400, 'invalid_input', 'Choose a valid parent category.', {
      parent_id: 'Choose a valid parent category.',
    });
  }

  if (current.type !== type) {
    throw new AppError(400, 'invalid_input', 'Parent and child must have the same type.', {
      parent_id: 'Pick a parent with the same type.',
    });
  }

  const seen = new Set();

  while (current) {
    if (selfId !== null && current.id === selfId) {
      throw new AppError(400, 'invalid_input', 'A category cannot be moved under itself.', {
        parent_id: 'Pick a different parent.',
      });
    }

    if (seen.has(current.id)) break;

    seen.add(current.id);

    current = current.parent_id ? await findCategory(current.parent_id, userId) : null;
  }
}

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const [rows] = await db.execute(
    `${SELECT_CATEGORY}
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY type, name, id`,
    [req.user.id],
  );

  res.json(rows.map(toCategory));
});

router.post('/', validate(createSchema), async (req, res) => {
  const { name, type, parent_id: parentId, is_active: isActive } = req.body;
  const color = req.body.color === undefined ? DEFAULT_COLOR : req.body.color;

  await assertParent(parentId ?? null, req.user.id, type);

  try {
    const [result] = await db.execute(
      `INSERT INTO categories (user_id, name, type, parent_id, color, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, name, type, parentId ?? null, color, isActive ? 1 : 0],
    );

    res.status(201).json(await findCategory(result.insertId, req.user.id));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw duplicateNameError();
    throw error;
  }
});

router.patch('/:id', validate(updateSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'not_found', 'Category not found.');

  const existing = await findCategory(id, req.user.id);
  if (!existing) throw new AppError(404, 'not_found', 'Category not found.');

  const type = req.body.type ?? existing.type;
  const parentId = req.body.parent_id === undefined ? existing.parent_id : req.body.parent_id;

  await assertParent(parentId, req.user.id, type, id);

  if (req.body.type && req.body.type !== existing.type) {
    const [children] = await db.execute(
      'SELECT 1 FROM categories WHERE parent_id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
      [id, req.user.id],
    );

    if (children.length) {
      throw new AppError(409, 'category_has_children', 'Move its subcategories before changing the type.');
    }
  }

  const fields = [];
  const values = [];

  for (const [column, value] of [
    ['name', req.body.name],
    ['type', req.body.type],
    ['parent_id', req.body.parent_id],
    ['color', req.body.color],
    ['is_active', req.body.is_active === undefined ? undefined : req.body.is_active ? 1 : 0],
  ]) {
    if (value !== undefined) {
      fields.push(`${column} = ?`);
      values.push(value);
    }
  }

  try {
    await db.execute(
      `UPDATE categories SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      [...values, id, req.user.id],
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw duplicateNameError();
    throw error;
  }

  res.json(await findCategory(id, req.user.id));
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(404, 'not_found', 'Category not found.');

  const category = await findCategory(id, req.user.id);
  if (!category) throw new AppError(404, 'not_found', 'Category not found.');

  const [referenced] = await db.execute(
    `SELECT 1 FROM transactions WHERE category_id = ? AND user_id = ? AND deleted_at IS NULL
     UNION ALL
     SELECT 1 FROM budgets WHERE category_id = ? AND user_id = ? AND deleted_at IS NULL
     UNION ALL
     SELECT 1 FROM subscriptions WHERE category_id = ? AND user_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [id, req.user.id, id, req.user.id, id, req.user.id],
  );

  if (referenced.length) {
    throw new AppError(
      409,
      'category_in_use',
      'Move its transactions and budgets first, or rename it instead.',
    );
  }

  await db.execute(
    'UPDATE categories SET deleted_at = NOW(), is_active = 0 WHERE id = ? AND user_id = ?',
    [id, req.user.id],
  );

  res.status(204).end();
});

export default router;
