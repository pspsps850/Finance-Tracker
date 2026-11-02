import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import app from '../src/app.js';
import { closePool, db, verifyConnection } from '../src/db/pool.js';
import { addDays, currentMonthKey, monthRange, todayKey } from '../src/lib/dates.js';

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'ft_sid';
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const emails = [
  `ledger-owner-${suffix}@example.test`,
  `ledger-stranger-${suffix}@example.test`,
];

const state = {};
let owner;
let stranger;

function client(cookie) {
  return {
    get: (path) => request(app).get(path).set('Cookie', cookie),
    post: (path, body) => request(app).post(path).set('Cookie', cookie).send(body),
    patch: (path, body) => request(app).patch(path).set('Cookie', cookie).send(body),
    remove: (path) => request(app).delete(path).set('Cookie', cookie),
  };
}

async function createUser(email) {
  const [result] = await db.execute(
    `INSERT INTO users (email, password_hash, display_name, email_verified_at)
     VALUES (?, ?, 'Ledger Test', NOW())`,
    [email, 'not-a-real-password-hash'],
  );

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  await db.execute(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES (?, ?, TIMESTAMPADD(DAY, 1, NOW()))`,
    [result.insertId, tokenHash],
  );

  return { id: result.insertId, cookie: `${COOKIE_NAME}=${token}` };
}

async function deleteUserData(userId) {
  await db.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
  await db.execute('DELETE FROM transactions WHERE user_id = ?', [userId]);
  await db.execute('DELETE FROM goal_allocations WHERE user_id = ?', [userId]);
  await db.execute('DELETE FROM goals WHERE user_id = ?', [userId]);
  await db.execute('DELETE FROM budgets WHERE user_id = ?', [userId]);
  await db.execute('DELETE FROM subscriptions WHERE user_id = ?', [userId]);
  await db.execute('DELETE FROM debts WHERE user_id = ?', [userId]);
  await db.execute('UPDATE categories SET parent_id = NULL WHERE user_id = ?', [userId]);
  await db.execute('DELETE FROM categories WHERE user_id = ?', [userId]);
  await db.execute('DELETE FROM accounts WHERE user_id = ?', [userId]);
  await db.execute('DELETE FROM users WHERE id = ?', [userId]);
}

function atToday() {
  return `${todayKey()}T10:00:00+08:00`;
}

before(async () => {
  await verifyConnection();

  const ownerUser = await createUser(emails[0]);
  const strangerUser = await createUser(emails[1]);

  state.ownerId = ownerUser.id;
  state.strangerId = strangerUser.id;
  owner = client(ownerUser.cookie);
  stranger = client(strangerUser.cookie);
});

after(async () => {
  await deleteUserData(state.ownerId);
  await deleteUserData(state.strangerId);
  await closePool();
});

test('creates accounts and enforces category rules', async () => {
  const asset = await owner.post('/api/accounts', {
    name: 'Ledger Bank',
    type: 'asset',
    subtype: 'bank',
    opening_balance_cents: 500000,
  });
  const secondAsset = await owner.post('/api/accounts', {
    name: 'Ledger Wallet',
    type: 'asset',
    subtype: 'cash',
    opening_balance_cents: 0,
  });
  const liability = await owner.post('/api/accounts', {
    name: 'Ledger Card',
    type: 'liability',
    subtype: 'credit_card',
    opening_balance_cents: 100000,
  });

  assert.equal(asset.status, 201);
  assert.equal(secondAsset.status, 201);
  assert.equal(liability.status, 201);

  state.assetId = asset.body.id;
  state.secondAssetId = secondAsset.body.id;
  state.liabilityId = liability.body.id;

  const needs = await owner.post('/api/categories', {
    name: 'Ledger Needs',
    type: 'needs',
    color: '#4f6b57',
  });
  const income = await owner.post('/api/categories', {
    name: 'Ledger Income',
    type: 'income',
    color: '#1f6b4a',
  });
  const wants = await owner.post('/api/categories', {
    name: 'Ledger Wants',
    type: 'wants',
    color: '#a33a2b',
  });
  const child = await owner.post('/api/categories', {
    name: 'Ledger Child',
    type: 'needs',
    parent_id: needs.body.id,
  });

  assert.equal(needs.status, 201);
  assert.equal(income.status, 201);
  assert.equal(wants.status, 201);
  assert.equal(child.status, 201);

  state.needsCategoryId = needs.body.id;
  state.incomeCategoryId = income.body.id;
  state.wantsCategoryId = wants.body.id;

  const duplicate = await owner.post('/api/categories', {
    name: 'ledger needs',
    type: 'needs',
  });

  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'category_exists');

  const typeMismatch = await owner.post('/api/categories', {
    name: 'Ledger Mismatch',
    type: 'wants',
    parent_id: needs.body.id,
  });

  assert.equal(typeMismatch.status, 400);
  assert.ok(typeMismatch.body.error.fields.parent_id);

  const typeChange = await owner.patch(`/api/categories/${needs.body.id}`, { type: 'wants' });

  assert.equal(typeChange.status, 409);
  assert.equal(typeChange.body.error.code, 'category_has_children');
});

test('records, filters, edits and isolates transactions', async () => {
  const expense = await owner.post('/api/transactions', {
    account_id: state.assetId,
    category_id: state.needsCategoryId,
    amount_cents: -30000,
    occurred_at: atToday(),
    description: 'Ledger groceries',
  });
  const liabilityExpense = await owner.post('/api/transactions', {
    account_id: state.liabilityId,
    category_id: state.needsCategoryId,
    amount_cents: -10000,
    occurred_at: atToday(),
    description: 'Ledger card purchase',
  });
  const income = await owner.post('/api/transactions', {
    account_id: state.assetId,
    category_id: state.incomeCategoryId,
    amount_cents: 100000,
    occurred_at: atToday(),
    description: 'Ledger salary',
  });

  assert.equal(expense.status, 201);
  assert.equal(expense.body.account_name, 'Ledger Bank');
  assert.equal(liabilityExpense.status, 201);
  assert.equal(income.status, 201);

  state.expenseId = expense.body.id;

  const page = await owner.get('/api/transactions?page=1&page_size=20&from=&to=');

  assert.equal(page.status, 200);
  assert.equal(page.body.total, 3);
  assert.equal(page.body.page, 1);
  assert.equal(page.body.page_size, 20);
  assert.equal(page.body.items[0].account_name, 'Ledger Bank');

  const search = await owner.get('/api/transactions?q=groceries');

  assert.equal(search.status, 200);
  assert.equal(search.body.total, 1);
  assert.equal(search.body.items[0].description, 'Ledger groceries');

  const byAccount = await owner.get(`/api/transactions?account_id=${state.liabilityId}`);

  assert.equal(byAccount.body.total, 1);
  assert.equal(byAccount.body.items[0].amount_cents, -10000);

  const firstPage = await owner.get('/api/transactions?page=1&page_size=2');
  const secondPage = await owner.get('/api/transactions?page=2&page_size=2');

  assert.equal(firstPage.body.items.length, 2);
  assert.equal(secondPage.body.items.length, 1);
  assert.equal(secondPage.body.total, 3);

  const edited = await owner.patch(`/api/transactions/${expense.body.id}`, {
    amount_cents: -35000,
    description: 'Ledger groceries updated',
  });

  assert.equal(edited.status, 200);
  assert.equal(edited.body.amount_cents, -35000);
  assert.equal(edited.body.description, 'Ledger groceries updated');

  const foreignEdit = await stranger.patch(`/api/transactions/${expense.body.id}`, {
    amount_cents: -1,
  });
  const foreignDelete = await stranger.remove(`/api/transactions/${expense.body.id}`);

  assert.equal(foreignEdit.status, 404);
  assert.equal(foreignDelete.status, 404);

  const summaryBefore = await owner.get(`/api/reports/summary?month=${currentMonthKey()}`);

  const transfer = await owner.post('/api/transfers', {
    from_account_id: state.assetId,
    to_account_id: state.secondAssetId,
    amount_cents: 10000,
    occurred_at: atToday(),
    description: 'Ledger transfer',
  });

  assert.equal(transfer.status, 201);
  assert.equal(transfer.body.legs.length, 2);
  assert.equal(transfer.body.legs[0].amount_cents + transfer.body.legs[1].amount_cents, 0);

  const afterTransfer = await owner.get('/api/transactions?page_size=100');

  assert.equal(afterTransfer.body.total, 5);

  const transferEdit = await owner.patch(`/api/transactions/${transfer.body.legs[0].id}`, {
    description: 'Nope',
  });

  assert.equal(transferEdit.status, 409);
  assert.equal(transferEdit.body.error.code, 'transfer_locked');

  const summaryDuringTransfer = await owner.get(`/api/reports/summary?month=${currentMonthKey()}`);

  assert.equal(summaryDuringTransfer.body.month_expense_cents, summaryBefore.body.month_expense_cents);

  const removed = await owner.remove(`/api/transactions/${transfer.body.legs[0].id}`);

  assert.equal(removed.status, 204);

  const afterDelete = await owner.get('/api/transactions?page_size=100');

  assert.equal(afterDelete.body.total, 3);

  const emptyStrangerList = await stranger.get('/api/transactions');

  assert.equal(emptyStrangerList.body.total, 0);
});

test('creates budgets, computes spending, and guards duplicates', async () => {
  const budget = await owner.post('/api/budgets', {
    category_id: state.needsCategoryId,
    month: currentMonthKey(),
    limit_cents: 100000,
  });

  assert.equal(budget.status, 201);
  assert.equal(budget.body.period_start, monthRange(currentMonthKey()).start);
  assert.equal(budget.body.period_end, monthRange(currentMonthKey()).end);

  state.budgetId = budget.body.id;

  const rows = await owner.get(`/api/budgets?month=${currentMonthKey()}`);
  const row = rows.body.find((item) => item.id === budget.body.id);

  assert.ok(row);
  assert.equal(row.category_name, 'Ledger Needs');
  assert.equal(row.spent_cents, 45000);
  assert.equal(row.remaining_cents, 55000);
  assert.equal(row.progress_pct, 45);

  const duplicate = await owner.post('/api/budgets', {
    category_id: state.needsCategoryId,
    month: currentMonthKey(),
    limit_cents: 50000,
  });

  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'budget_exists');

  const edited = await owner.patch(`/api/budgets/${budget.body.id}`, { limit_cents: 200000 });

  assert.equal(edited.status, 200);
  assert.equal(edited.body.limit_cents, 200000);

  const updatedRows = await owner.get(`/api/budgets?month=${currentMonthKey()}`);
  const updated = updatedRows.body.find((item) => item.id === budget.body.id);

  assert.equal(updated.spent_cents, 45000);
  assert.equal(updated.remaining_cents, 155000);
  assert.equal(updated.progress_pct, 23);

  const foreignDelete = await stranger.remove(`/api/budgets/${budget.body.id}`);
  const strangerRows = await stranger.get(`/api/budgets?month=${currentMonthKey()}`);

  assert.equal(foreignDelete.status, 404);
  assert.deepEqual(strangerRows.body, []);
});

test('tracks goal progress and cascades allocations on delete', async () => {
  const goal = await owner.post('/api/goals', {
    name: 'Ledger Goal',
    target_cents: 100000,
    target_date: addDays(todayKey(), 90),
    linked_account_id: state.assetId,
  });

  assert.equal(goal.status, 201);

  state.goalId = goal.body.id;

  const allocation = await owner.post(`/api/goals/${goal.body.id}/allocations`, {
    account_id: state.assetId,
    amount_cents: 40000,
    allocated_at: atToday(),
    note: 'First top-up',
  });

  assert.equal(allocation.status, 201);
  assert.equal(allocation.body.amount_cents, 40000);

  const goals = await owner.get('/api/goals');

  assert.equal(goals.status, 200);
  assert.equal(goals.body.length, 1);
  assert.equal(goals.body[0].allocated_cents, 40000);
  assert.equal(goals.body[0].progress_pct, 40);
  assert.equal(goals.body[0].allocation_count, 1);
  assert.equal(goals.body[0].linked_account_name, 'Ledger Bank');

  const foreignAllocation = await stranger.post(`/api/goals/${goal.body.id}/allocations`, {
    account_id: state.assetId,
    amount_cents: 1000,
  });

  assert.equal(foreignAllocation.status, 404);

  const achieved = await owner.patch(`/api/goals/${goal.body.id}`, { status: 'achieved' });

  assert.equal(achieved.status, 200);
  assert.equal(achieved.body.status, 'achieved');

  const removed = await owner.remove(`/api/goals/${goal.body.id}`);

  assert.equal(removed.status, 204);

  const empty = await owner.get('/api/goals');

  assert.deepEqual(empty.body, []);

  const [allocations] = await db.execute(
    'SELECT deleted_at FROM goal_allocations WHERE goal_id = ?',
    [goal.body.id],
  );

  assert.ok(allocations[0].deleted_at);
});

test('tracks subscriptions, keeps date keys, and pauses them', async () => {
  const due = addDays(todayKey(), 5);
  const subscription = await owner.post('/api/subscriptions', {
    name: 'Ledger Streaming',
    amount_cents: 54900,
    billing_cycle: 'monthly',
    next_due_date: due,
    account_id: state.liabilityId,
    category_id: state.wantsCategoryId,
  });

  assert.equal(subscription.status, 201);
  assert.equal(subscription.body.next_due_date, due);

  state.subscriptionId = subscription.body.id;

  const paused = await owner.post('/api/subscriptions', {
    name: 'Ledger Gym',
    amount_cents: 150000,
    billing_cycle: 'monthly',
    next_due_date: addDays(todayKey(), 10),
    account_id: state.assetId,
    category_id: state.wantsCategoryId,
  });

  assert.equal(paused.status, 201);

  const pause = await owner.patch(`/api/subscriptions/${paused.body.id}`, { is_active: 0 });

  assert.equal(pause.status, 200);
  assert.equal(pause.body.is_active, 0);

  const removed = await owner.remove(`/api/subscriptions/${paused.body.id}`);

  assert.equal(removed.status, 204);

  const rows = await owner.get('/api/subscriptions');

  assert.equal(rows.body.length, 1);
  assert.equal(rows.body[0].id, subscription.body.id);
  assert.equal(rows.body[0].next_due_date, due);
  assert.equal(rows.body[0].account_name, 'Ledger Card');
  assert.equal(rows.body[0].category_name, 'Ledger Wants');

  const foreignPause = await stranger.patch(`/api/subscriptions/${subscription.body.id}`, {
    is_active: 0,
  });

  assert.equal(foreignPause.status, 404);
});

test('tracks debts, validates fields, and isolates them per user', async () => {
  const debt = await owner.post('/api/debts', {
    name: 'Ledger Car Loan',
    account_id: state.assetId,
    principal_cents: 90000000,
    current_balance_cents: 64000000,
    interest_rate_bps: 650,
    minimum_payment_cents: 1500000,
    due_day: 10,
  });

  assert.equal(debt.status, 201);
  assert.equal(debt.body.name, 'Ledger Car Loan');
  assert.equal(debt.body.principal_cents, 90000000);
  assert.equal(debt.body.current_balance_cents, 64000000);
  assert.equal(debt.body.interest_rate_bps, 650);
  assert.equal(debt.body.minimum_payment_cents, 1500000);
  assert.equal(debt.body.due_day, 10);

  const rows = await owner.get('/api/debts');

  assert.equal(rows.status, 200);
  assert.equal(rows.body.length, 1);
  assert.equal(rows.body[0].id, debt.body.id);

  const updated = await owner.patch(`/api/debts/${debt.body.id}`, {
    current_balance_cents: 60000000,
    interest_rate_bps: 700,
    due_day: null,
  });

  assert.equal(updated.status, 200);
  assert.equal(updated.body.current_balance_cents, 60000000);
  assert.equal(updated.body.interest_rate_bps, 700);
  assert.equal(updated.body.due_day, null);

  const badDay = await owner.patch(`/api/debts/${debt.body.id}`, { due_day: 32 });

  assert.equal(badDay.status, 400);
  assert.ok(badDay.body.error.fields.due_day);

  const badAccount = await owner.post('/api/debts', {
    name: 'Ledger Bad Debt',
    account_id: 2_147_483_647,
    principal_cents: 1000,
    current_balance_cents: 1000,
  });

  assert.equal(badAccount.status, 400);
  assert.ok(badAccount.body.error.fields.account_id);

  const foreignPatch = await stranger.patch(`/api/debts/${debt.body.id}`, {
    current_balance_cents: 1,
  });
  const foreignDelete = await stranger.remove(`/api/debts/${debt.body.id}`);
  const strangerRows = await stranger.get('/api/debts');

  assert.equal(foreignPatch.status, 404);
  assert.equal(foreignDelete.status, 404);
  assert.deepEqual(strangerRows.body, []);

  const removed = await owner.remove(`/api/debts/${debt.body.id}`);

  assert.equal(removed.status, 204);

  const empty = await owner.get('/api/debts');

  assert.deepEqual(empty.body, []);
});

test('reports summary, net worth and cashflow from ledger data', async () => {
  const month = currentMonthKey();
  const range = monthRange(month);

  const summary = await owner.get(`/api/reports/summary?month=${month}`);

  assert.equal(summary.status, 200);
  assert.equal(summary.body.month, month);
  assert.equal(summary.body.period_start, range.start);
  assert.equal(summary.body.period_end, range.end);
  assert.equal(summary.body.assets_cents, 565000);
  assert.equal(summary.body.liabilities_cents, 110000);
  assert.equal(summary.body.net_worth_cents, 455000);
  assert.equal(summary.body.month_income_cents, 100000);
  assert.equal(summary.body.month_expense_cents, 45000);
  assert.equal(summary.body.budget_limit_cents, 200000);
  assert.equal(summary.body.budget_spent_cents, 45000);
  assert.equal(summary.body.upcoming_subscriptions.length, 1);
  assert.equal(summary.body.upcoming_subscriptions[0].next_due_date, addDays(todayKey(), 5));
  assert.deepEqual(summary.body.goals, []);
  assert.equal(summary.body.recent_transactions.length, 3);

  const netWorth = await owner.get('/api/reports/net-worth?months=3');

  assert.equal(netWorth.status, 200);
  assert.equal(netWorth.body.length, 3);
  assert.equal(netWorth.body[2].month, month);
  assert.equal(netWorth.body[2].assets_cents, 565000);
  assert.equal(netWorth.body[2].liabilities_cents, 110000);
  assert.equal(netWorth.body[2].net_worth_cents, 455000);

  const cashflow = await owner.get('/api/reports/cashflow?months=3');

  assert.equal(cashflow.status, 200);
  assert.equal(cashflow.body.length, 3);
  assert.equal(cashflow.body[2].month, month);
  assert.equal(cashflow.body[2].income_cents, 100000);
  assert.equal(cashflow.body[2].expense_cents, 45000);

  const accounts = await owner.get('/api/accounts');
  const bank = accounts.body.find((account) => account.id === state.assetId);
  const card = accounts.body.find((account) => account.id === state.liabilityId);

  assert.equal(bank.balance_cents, 565000);
  assert.equal(card.balance_cents, 110000);

  const invalidMonth = await owner.get('/api/reports/summary?month=2026-13');

  assert.equal(invalidMonth.status, 400);
});

test('blocks category deletes in use and allows unused deletes', async () => {
  const inUse = await owner.remove(`/api/categories/${state.needsCategoryId}`);

  assert.equal(inUse.status, 409);
  assert.equal(inUse.body.error.code, 'category_in_use');

  const temporary = await owner.post('/api/categories', {
    name: 'Ledger Temporary',
    type: 'wants',
    color: '#9b5c7a',
  });

  assert.equal(temporary.status, 201);

  const removed = await owner.remove(`/api/categories/${temporary.body.id}`);

  assert.equal(removed.status, 204);

  const rows = await owner.get('/api/categories');

  assert.equal(rows.body.some((category) => category.id === temporary.body.id), false);
});
