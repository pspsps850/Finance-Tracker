import express from 'express';
import { db } from '../db/pool.js';
import {
  addDays,
  currentMonthKey,
  isValidMonthKey,
  lastNMonths,
  monthRange,
  todayKey,
} from '../lib/dates.js';
import { AppError } from '../middleware/error.js';
import { requireAuth } from '../middleware/requireAuth.js';

function readMonth(value, field = 'month') {
  if (value === undefined || value === '') return currentMonthKey();

  if (typeof value !== 'string' || !isValidMonthKey(value)) {
    throw new AppError(400, 'invalid_input', 'Choose a valid month.', {
      [field]: 'Use YYYY-MM.',
    });
  }

  return value;
}

function readMonths(value) {
  if (value === undefined || value === '') return 6;

  const months = Number(value);

  if (!Number.isInteger(months)) {
    throw new AppError(400, 'invalid_input', 'Choose a valid month count.', {
      months: 'Use a whole number.',
    });
  }

  return Math.min(24, Math.max(2, months));
}

async function netWorthAt(userId, cutoff = null) {
  const cutoffSql = cutoff ? 'AND t.occurred_at < DATE_ADD(?, INTERVAL 1 DAY)' : '';
  const params = cutoff ? [cutoff, userId] : [userId];

  const [rows] = await db.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN x.type = 'asset'
         THEN x.opening_balance_cents + x.movement_cents ELSE 0 END), 0) AS assets_cents,
       COALESCE(SUM(CASE WHEN x.type = 'liability'
         THEN x.opening_balance_cents - x.movement_cents ELSE 0 END), 0) AS liabilities_cents
     FROM (
       SELECT a.type, a.opening_balance_cents,
              COALESCE(SUM(t.amount_cents), 0) AS movement_cents
         FROM accounts a
         LEFT JOIN transactions t
           ON t.account_id = a.id
          AND t.deleted_at IS NULL
          ${cutoffSql}
        WHERE a.user_id = ? AND a.deleted_at IS NULL
        GROUP BY a.id, a.type, a.opening_balance_cents
     ) x`,
    params,
  );

  const assets = Number(rows[0].assets_cents);
  const liabilities = Number(rows[0].liabilities_cents);

  return {
    assets_cents: assets,
    liabilities_cents: liabilities,
    net_worth_cents: assets - liabilities,
  };
}

async function cashflowForMonth(userId, month) {
  const range = monthRange(month);

  const [rows] = await db.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END), 0) AS income_cents,
       COALESCE(SUM(CASE WHEN amount_cents < 0 THEN -amount_cents ELSE 0 END), 0) AS expense_cents
     FROM transactions
     WHERE user_id = ? AND deleted_at IS NULL AND transfer_group_id IS NULL
       AND occurred_at >= ? AND occurred_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    [userId, range.start, range.end],
  );

  return {
    income_cents: Number(rows[0].income_cents),
    expense_cents: Number(rows[0].expense_cents),
  };
}

async function cashflowSeries(userId, months) {
  const first = months[0];
  const last = months[months.length - 1];
  const firstRange = monthRange(first);
  const lastRange = monthRange(last);

  const [rows] = await db.execute(
    `SELECT DATE_FORMAT(occurred_at, '%Y-%m') AS month_key,
            COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END), 0) AS income_cents,
            COALESCE(SUM(CASE WHEN amount_cents < 0 THEN -amount_cents ELSE 0 END), 0) AS expense_cents
       FROM transactions
      WHERE user_id = ? AND deleted_at IS NULL AND transfer_group_id IS NULL
        AND occurred_at >= ? AND occurred_at < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY DATE_FORMAT(occurred_at, '%Y-%m')`,
    [userId, firstRange.start, lastRange.end],
  );

  const totals = new Map(
    rows.map((row) => [
      row.month_key,
      {
        income_cents: Number(row.income_cents),
        expense_cents: Number(row.expense_cents),
      },
    ]),
  );

  return months.map((month) => ({
    month,
    income_cents: totals.get(month)?.income_cents ?? 0,
    expense_cents: totals.get(month)?.expense_cents ?? 0,
  }));
}

async function netWorthSeries(userId, months) {
  return Promise.all(
    months.map(async (month) => ({
      month,
      ...(await netWorthAt(userId, monthRange(month).end)),
    })),
  );
}

async function budgetTotals(userId, range) {
  const [rows] = await db.execute(
    `SELECT COALESCE(SUM(limit_cents), 0) AS budget_limit_cents,
            COALESCE(SUM(spent_cents), 0) AS budget_spent_cents
       FROM budget_progress
      WHERE user_id = ? AND period_start <= ? AND period_end >= ?`,
    [userId, range.end, range.start],
  );

  return {
    budget_limit_cents: Number(rows[0].budget_limit_cents),
    budget_spent_cents: Number(rows[0].budget_spent_cents),
  };
}

async function upcomingSubscriptions(userId, horizon) {
  const [rows] = await db.execute(
    `SELECT s.id, s.user_id, s.name, s.amount_cents, s.currency, s.billing_cycle,
            DATE_FORMAT(s.next_due_date, '%Y-%m-%d') AS next_due_date,
            s.account_id, s.category_id, s.is_active, s.created_at, s.deleted_at,
            a.name AS account_name, c.name AS category_name
       FROM subscriptions s
       LEFT JOIN accounts a ON a.id = s.account_id
       LEFT JOIN categories c ON c.id = s.category_id
      WHERE s.user_id = ? AND s.deleted_at IS NULL AND s.is_active = 1
        AND s.next_due_date <= ?
      ORDER BY s.next_due_date, s.id
      LIMIT 4`,
    [userId, horizon],
  );

  return rows.map((row) => ({
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
    account_name: row.account_name ?? null,
    category_name: row.category_name ?? null,
  }));
}

async function activeGoals(userId, limit) {
  const [rows] = await db.execute(
    `SELECT g.id, g.user_id, g.name, g.target_cents,
            DATE_FORMAT(g.target_date, '%Y-%m-%d') AS target_date,
            g.linked_account_id, g.status, g.created_at, g.deleted_at,
            COALESCE(SUM(ga.amount_cents), 0) AS allocated_cents,
            COUNT(ga.id) AS allocation_count,
            a.name AS linked_account_name
       FROM goals g
       LEFT JOIN goal_allocations ga ON ga.goal_id = g.id AND ga.deleted_at IS NULL
       LEFT JOIN accounts a ON a.id = g.linked_account_id
      WHERE g.user_id = ? AND g.deleted_at IS NULL AND g.status = 'active'
      GROUP BY g.id, a.name
      ORDER BY g.id
      LIMIT ?`,
    [userId, limit],
  );

  return rows.map((row) => {
    const target = row.target_cents === null ? null : Number(row.target_cents);
    const allocated = Number(row.allocated_cents);

    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      target_cents: target,
      target_date: row.target_date,
      linked_account_id: row.linked_account_id,
      status: row.status,
      created_at: row.created_at,
      deleted_at: row.deleted_at,
      allocated_cents: allocated,
      progress_pct: target && target > 0 ? Math.min(999, Math.round((allocated / target) * 100)) : null,
      linked_account_name: row.linked_account_name ?? null,
      allocation_count: Number(row.allocation_count),
    };
  });
}

async function recentTransactions(userId, limit) {
  const [rows] = await db.execute(
    `SELECT t.id, t.user_id, t.account_id, t.category_id, t.amount_cents, t.currency,
            t.occurred_at, t.description, t.transfer_group_id, t.parent_transaction_id,
            t.created_at, t.deleted_at,
            a.name AS account_name, a.type AS account_type,
            c.name AS category_name, c.color AS category_color, c.type AS category_type
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ? AND t.deleted_at IS NULL
      ORDER BY t.occurred_at DESC, t.id DESC
      LIMIT ?`,
    [userId, limit],
  );

  return rows.map((row) => ({
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
  }));
}

const router = express.Router();

router.use(requireAuth);

router.get('/summary', async (req, res) => {
  const month = readMonth(req.query.month);
  const range = monthRange(month);
  const horizon = addDays(todayKey(), 30);

  const [worth, flow, budgets, upcoming, goals, recent] = await Promise.all([
    netWorthAt(req.user.id),
    cashflowForMonth(req.user.id, month),
    budgetTotals(req.user.id, range),
    upcomingSubscriptions(req.user.id, horizon),
    activeGoals(req.user.id, 3),
    recentTransactions(req.user.id, 5),
  ]);

  res.json({
    month,
    period_start: range.start,
    period_end: range.end,
    ...worth,
    month_income_cents: flow.income_cents,
    month_expense_cents: flow.expense_cents,
    ...budgets,
    upcoming_subscriptions: upcoming,
    goals,
    recent_transactions: recent,
  });
});

router.get('/net-worth', async (req, res) => {
  const end = readMonth(req.query.end, 'end');
  const months = lastNMonths(readMonths(req.query.months), end);

  res.json(await netWorthSeries(req.user.id, months));
});

router.get('/cashflow', async (req, res) => {
  const end = readMonth(req.query.end, 'end');
  const months = lastNMonths(readMonths(req.query.months), end);

  res.json(await cashflowSeries(req.user.id, months));
});

export default router;
