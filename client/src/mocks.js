import { ApiError } from './lib/errors.js'
import { DEMO_EMAIL, DEMO_OTP, DEMO_PASSWORD } from './lib/demo.js'
import {
  addDays,
  currentMonthKey,
  lastNMonths,
  monthRange,
  shiftMonth,
  todayKey,
} from './lib/dates.js'

/**
 * In-browser demo backend. It mirrors the API contract so the UI can be
 * exercised before the Express server exists. Data lives in localStorage;
 * nothing here is secure and nothing here ever ships to a production build.
 */

const STORE_KEY = 'ft_mock_v1'
const SESSION_KEY = 'ft_mock_session'
const MAX_OTP_ATTEMPTS = 5

function at(monthOffset, day, hour = 9) {
  const month = shiftMonth(currentMonthKey(), monthOffset)
  const lastDay = monthRange(month).end.slice(8)
  const date = day === 'last' ? lastDay : String(day).padStart(2, '0')
  return `${month}-${date}T${String(hour).padStart(2, '0')}:00:00+08:00`
}

function seed() {
  const now = new Date().toISOString()
  const today = todayKey()
  const month = currentMonthKey()
  const range = monthRange(month)

  const accounts = [
    {
      id: 1,
      user_id: 1,
      name: 'BPI Savings',
      type: 'asset',
      subtype: 'bank',
      currency: 'PHP',
      opening_balance_cents: 8500000,
      is_active: 1,
      created_at: now,
      deleted_at: null,
    },
    {
      id: 2,
      user_id: 1,
      name: 'Cash wallet',
      type: 'asset',
      subtype: 'cash',
      currency: 'PHP',
      opening_balance_cents: 500000,
      is_active: 1,
      created_at: now,
      deleted_at: null,
    },
    {
      id: 3,
      user_id: 1,
      name: 'BPI Credit Card',
      type: 'liability',
      subtype: 'credit_card',
      currency: 'PHP',
      opening_balance_cents: 1248000,
      is_active: 1,
      created_at: now,
      deleted_at: null,
    },
    {
      id: 4,
      user_id: 1,
      name: 'GCash',
      type: 'asset',
      subtype: 'ewallet',
      currency: 'PHP',
      opening_balance_cents: 320000,
      is_active: 1,
      created_at: now,
      deleted_at: null,
    },
  ]

  const categorySeed = [
    ['Rent', 'needs', '#8c5b3f'],
    ['Groceries', 'needs', '#4f6b57'],
    ['Utilities', 'needs', '#6b7280'],
    ['Transport', 'needs', '#7c6a46'],
    ['Dining out', 'wants', '#a33a2b'],
    ['Shopping', 'wants', '#9b5c7a'],
    ['Subscriptions', 'wants', '#3b4c8a'],
    ['Emergency fund', 'savings', '#1f6b4a'],
    ['Travel fund', 'savings', '#2f6f7a'],
    ['Salary', 'income', '#1f6b4a'],
    ['Freelance', 'income', '#4f7c5c'],
    ['Bank interest', 'interest', '#5b6b2f'],
  ]
  const categories = categorySeed.map(([name, type, color], index) => ({
    id: index + 1,
    user_id: 1,
    name,
    type,
    parent_id: null,
    color,
    is_active: 1,
    created_at: now,
    deleted_at: null,
  }))

  const categoryId = (name) => categories.find((category) => category.name === name).id

  const transactions = []
  let nextTransactionId = 1

  const addTransaction = (accountId, categoryName, amount, monthOffset, day, description, hour = 9) => {
    const occurredAt = at(monthOffset, day, hour)
    if (occurredAt.slice(0, 10) > today) return
    transactions.push({
      id: nextTransactionId++,
      user_id: 1,
      account_id: accountId,
      category_id: categoryName ? categoryId(categoryName) : null,
      amount_cents: amount,
      currency: 'PHP',
      occurred_at: occurredAt,
      description,
      transfer_group_id: null,
      parent_transaction_id: null,
      created_at: now,
      deleted_at: null,
    })
  }

  for (let offset = -4; offset <= 0; offset += 1) {
    addTransaction(1, 'Salary', 2900000, offset, 15, 'Salary · first half')
    addTransaction(1, 'Salary', 2900000, offset, 'last', 'Salary · second half')
    addTransaction(1, 'Rent', -1800000, offset, 1, 'Apartment rent')
    addTransaction(1, 'Groceries', -320000, offset, 3, 'Weekly groceries')
    addTransaction(1, 'Groceries', -280000, offset, 17, 'Weekly groceries')
    addTransaction(1, 'Utilities', -210000, offset, 8, 'Meralco + water')
    addTransaction(4, 'Transport', -60000, offset, 10, 'Grab + jeepney')
    addTransaction(4, 'Dining out', -145000, offset, 5, 'Friday dinner')
    addTransaction(4, 'Dining out', -98000, offset, 19, 'Coffee and lunch')
  }

  addTransaction(1, 'Freelance', 800000, -3, 22, 'Design retainer')
  addTransaction(1, 'Freelance', 1200000, -1, 24, 'Landing page project')
  addTransaction(4, 'Shopping', -250000, -2, 14, 'Running shoes')
  addTransaction(1, 'Bank interest', 4525, -1, 'last', 'Savings interest')

  const transferGroup = 'demo-transfer-seed'
  const transferDay = at(0, 12)
  if (transferDay.slice(0, 10) <= today) {
    transactions.push(
      {
        id: nextTransactionId++,
        user_id: 1,
        account_id: 1,
        category_id: null,
        amount_cents: -400000,
        currency: 'PHP',
        occurred_at: transferDay,
        description: 'Transfer to GCash',
        transfer_group_id: transferGroup,
        parent_transaction_id: null,
        created_at: now,
        deleted_at: null,
      },
      {
        id: nextTransactionId++,
        user_id: 1,
        account_id: 4,
        category_id: null,
        amount_cents: 400000,
        currency: 'PHP',
        occurred_at: transferDay,
        description: 'Transfer from BPI Savings',
        transfer_group_id: transferGroup,
        parent_transaction_id: null,
        created_at: now,
        deleted_at: null,
      },
    )
  }

  const budgets = [
    { category: 'Groceries', limit: 900000 },
    { category: 'Utilities', limit: 400000 },
    { category: 'Dining out', limit: 600000 },
    { category: 'Shopping', limit: 500000 },
  ].map((item, index) => ({
    id: index + 1,
    user_id: 1,
    category_id: categoryId(item.category),
    period_start: range.start,
    period_end: range.end,
    limit_cents: item.limit,
    rollover: 0,
    created_at: now,
    deleted_at: null,
  }))

  const goals = [
    {
      id: 1,
      user_id: 1,
      name: 'Emergency fund',
      target_cents: 15000000,
      target_date: `${shiftMonth(month, 10)}-01`,
      linked_account_id: 1,
      status: 'active',
      created_at: now,
      deleted_at: null,
    },
    {
      id: 2,
      user_id: 1,
      name: 'Japan trip',
      target_cents: 12000000,
      target_date: `${shiftMonth(month, 8)}-15`,
      linked_account_id: 1,
      status: 'active',
      created_at: now,
      deleted_at: null,
    },
    {
      id: 3,
      user_id: 1,
      name: 'New laptop',
      target_cents: 8000000,
      target_date: `${shiftMonth(month, 5)}-01`,
      linked_account_id: 1,
      status: 'active',
      created_at: now,
      deleted_at: null,
    },
  ]

  const goalAllocations = [
    { id: 1, goal_id: 1, account_id: 1, amount_cents: 3000000, offset: -4, note: 'Initial fund' },
    { id: 2, goal_id: 1, account_id: 1, amount_cents: 1500000, offset: -1, note: 'Monthly top-up' },
    { id: 3, goal_id: 2, account_id: 1, amount_cents: 2000000, offset: -3, note: 'Start the travel fund' },
    { id: 4, goal_id: 2, account_id: 1, amount_cents: 1200000, offset: -1, note: 'Monthly top-up' },
    { id: 5, goal_id: 3, account_id: 1, amount_cents: 1500000, offset: -2, note: 'Laptop fund' },
  ].map((item) => ({
    id: item.id,
    user_id: 1,
    goal_id: item.goal_id,
    account_id: item.account_id,
    amount_cents: item.amount_cents,
    allocated_at: at(item.offset, 10),
    note: item.note,
    deleted_at: null,
  }))

  const debts = [
    {
      id: 1,
      user_id: 1,
      name: 'Car loan',
      account_id: null,
      principal_cents: 90000000,
      current_balance_cents: 64000000,
      interest_rate_bps: 650,
      minimum_payment_cents: 1500000,
      due_day: 10,
      created_at: now,
      deleted_at: null,
    },
    {
      id: 2,
      user_id: 1,
      name: 'SSS salary loan',
      account_id: null,
      principal_cents: 4500000,
      current_balance_cents: 2800000,
      interest_rate_bps: 1000,
      minimum_payment_cents: 95000,
      due_day: 25,
      created_at: now,
      deleted_at: null,
    },
  ]

  const subscriptions = [
    {
      id: 1,
      user_id: 1,
      name: 'Netflix',
      amount_cents: 54900,
      currency: 'PHP',
      billing_cycle: 'monthly',
      next_due_date: addDays(today, 3),
      account_id: 3,
      category_id: categoryId('Subscriptions'),
      is_active: 1,
      created_at: now,
      deleted_at: null,
    },
    {
      id: 2,
      user_id: 1,
      name: 'Spotify',
      amount_cents: 14900,
      currency: 'PHP',
      billing_cycle: 'monthly',
      next_due_date: addDays(today, 7),
      account_id: 4,
      category_id: categoryId('Subscriptions'),
      is_active: 1,
      created_at: now,
      deleted_at: null,
    },
    {
      id: 3,
      user_id: 1,
      name: 'Gym membership',
      amount_cents: 150000,
      currency: 'PHP',
      billing_cycle: 'monthly',
      next_due_date: addDays(today, 14),
      account_id: 1,
      category_id: categoryId('Subscriptions'),
      is_active: 1,
      created_at: now,
      deleted_at: null,
    },
    {
      id: 4,
      user_id: 1,
      name: 'iCloud+',
      amount_cents: 4900,
      currency: 'PHP',
      billing_cycle: 'monthly',
      next_due_date: addDays(today, 21),
      account_id: 3,
      category_id: categoryId('Subscriptions'),
      is_active: 1,
      created_at: now,
      deleted_at: null,
    },
  ]

  return {
    users: [
      {
        id: 1,
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        display_name: 'Ana Reyes',
        base_currency: 'PHP',
        timezone: 'Asia/Manila',
        email_verified_at: now,
        otp_hash: null,
        otp_expires_at: null,
        otp_attempts: 0,
        created_at: now,
        deleted_at: null,
      },
    ],
    accounts,
    categories,
    transactions,
    budgets,
    goals,
    goal_allocations: goalAllocations,
    debts,
    subscriptions,
  }
}

function load() {
  const raw = localStorage.getItem(STORE_KEY)
  if (raw) {
    try {
      return JSON.parse(raw)
    } catch {
      localStorage.removeItem(STORE_KEY)
    }
  }
  const state = seed()
  localStorage.setItem(STORE_KEY, JSON.stringify(state))
  return state
}

function save(state) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state))
}

function nextId(rows) {
  return rows.reduce((max, row) => Math.max(max, row.id), 0) + 1
}

function fail(status, code, message, fields = null) {
  throw new ApiError(message, { status, code, fields })
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    base_currency: user.base_currency,
    timezone: user.timezone,
    email_verified_at: user.email_verified_at,
  }
}

function currentUser(state) {
  const id = Number(localStorage.getItem(SESSION_KEY))
  const user = state.users.find((candidate) => candidate.id === id && !candidate.deleted_at)
  if (!user) fail(401, 'unauthorized', 'Your session expired. Sign in again.')
  return user
}

function accountOwed(state, account, cutoff = null) {
  const movements = state.transactions
    .filter((tx) => tx.account_id === account.id && !tx.deleted_at)
    .filter((tx) => !cutoff || tx.occurred_at.slice(0, 10) <= cutoff)
    .reduce((total, tx) => total + tx.amount_cents, 0)
  return account.opening_balance_cents - movements
}

function accountBalance(state, account) {
  if (account.type === 'liability') return accountOwed(state, account)
  const movements = state.transactions
    .filter((tx) => tx.account_id === account.id && !tx.deleted_at)
    .reduce((total, tx) => total + tx.amount_cents, 0)
  return account.opening_balance_cents + movements
}

function netWorth(state, cutoff = null) {
  let assets = 0
  let liabilities = 0
  for (const account of state.accounts.filter((item) => !item.deleted_at)) {
    if (account.type === 'liability') {
      liabilities += accountOwed(state, account, cutoff)
    } else {
      const movements = state.transactions
        .filter((tx) => tx.account_id === account.id && !tx.deleted_at)
        .filter((tx) => !cutoff || tx.occurred_at.slice(0, 10) <= cutoff)
        .reduce((total, tx) => total + tx.amount_cents, 0)
      assets += account.opening_balance_cents + movements
    }
  }
  return { assets_cents: assets, liabilities_cents: liabilities, net_worth_cents: assets - liabilities }
}

function enrichTransaction(state, tx) {
  const account = state.accounts.find((item) => item.id === tx.account_id)
  const category = state.categories.find((item) => item.id === tx.category_id)
  return {
    ...tx,
    account_name: account?.name ?? 'Unknown account',
    account_type: account?.type ?? 'asset',
    category_name: category?.name ?? null,
    category_color: category?.color ?? null,
    category_type: category?.type ?? null,
  }
}

function budgetRows(state, month) {
  const range = monthRange(month)
  return state.budgets
    .filter((budget) => !budget.deleted_at)
    .filter((budget) => budget.period_start <= range.end && budget.period_end >= range.start)
    .map((budget) => {
      const category = state.categories.find((item) => item.id === budget.category_id)
      const spent = state.transactions
        .filter((tx) => !tx.deleted_at && !tx.transfer_group_id)
        .filter((tx) => tx.category_id === budget.category_id)
        .filter((tx) => {
          const key = tx.occurred_at.slice(0, 10)
          return key >= budget.period_start && key <= budget.period_end
        })
        .reduce((total, tx) => total + Math.max(0, -tx.amount_cents), 0)
      return {
        ...budget,
        category_name: category?.name ?? 'Deleted category',
        category_type: category?.type ?? 'needs',
        category_color: category?.color ?? null,
        spent_cents: spent,
        remaining_cents: budget.limit_cents - spent,
        progress_pct: budget.limit_cents ? Math.round((spent / budget.limit_cents) * 100) : 0,
      }
    })
    .sort((a, b) => a.category_name.localeCompare(b.category_name))
}

function goalRows(state) {
  return state.goals
    .filter((goal) => !goal.deleted_at)
    .map((goal) => {
      const allocations = state.goal_allocations.filter(
        (allocation) => allocation.goal_id === goal.id && !allocation.deleted_at,
      )
      const allocated = allocations.reduce((total, item) => total + item.amount_cents, 0)
      const account = state.accounts.find((item) => item.id === goal.linked_account_id)
      return {
        ...goal,
        allocated_cents: allocated,
        progress_pct: goal.target_cents ? Math.min(999, Math.round((allocated / goal.target_cents) * 100)) : null,
        linked_account_name: account?.name ?? null,
        allocation_count: allocations.length,
      }
    })
    .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1))
}

function subscriptionRows(state) {
  return state.subscriptions
    .filter((subscription) => !subscription.deleted_at)
    .map((subscription) => {
      const account = state.accounts.find((item) => item.id === subscription.account_id)
      const category = state.categories.find((item) => item.id === subscription.category_id)
      return {
        ...subscription,
        account_name: account?.name ?? null,
        category_name: category?.name ?? null,
      }
    })
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
}

function monthCashflow(state, month) {
  const range = monthRange(month)
  let income = 0
  let expense = 0
  for (const tx of state.transactions) {
    if (tx.deleted_at || tx.transfer_group_id) continue
    const key = tx.occurred_at.slice(0, 10)
    if (key < range.start || key > range.end) continue
    if (tx.amount_cents > 0) income += tx.amount_cents
    else expense += -tx.amount_cents
  }
  return { income_cents: income, expense_cents: expense }
}

function summary(state, month) {
  const range = monthRange(month)
  const worth = netWorth(state)
  const flow = monthCashflow(state, month)
  const budgets = budgetRows(state, month)
  const today = todayKey()
  const horizon = addDays(today, 30)
  const upcoming = subscriptionRows(state)
    .filter((subscription) => subscription.is_active)
    .filter((subscription) => subscription.next_due_date <= horizon)
    .slice(0, 4)
  const goals = goalRows(state)
    .filter((goal) => goal.status === 'active')
    .slice(0, 3)
  const recent = [...state.transactions]
    .filter((tx) => !tx.deleted_at)
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : b.id - a.id))
    .slice(0, 5)
    .map((tx) => enrichTransaction(state, tx))

  return {
    month,
    period_start: range.start,
    period_end: range.end,
    ...worth,
    month_income_cents: flow.income_cents,
    month_expense_cents: flow.expense_cents,
    budget_limit_cents: budgets.reduce((total, item) => total + item.limit_cents, 0),
    budget_spent_cents: budgets.reduce((total, item) => total + item.spent_cents, 0),
    upcoming_subscriptions: upcoming,
    goals,
    recent_transactions: recent,
  }
}

function parsePath(path) {
  const url = new URL(path, 'http://mock.local')
  return { segments: url.pathname.split('/').filter(Boolean), params: url.searchParams }
}

function bodyValue(body, key, fallback = null) {
  return body && body[key] !== undefined ? body[key] : fallback
}

async function route(method, path, body) {
  const state = load()
  const { segments, params } = parsePath(path)
  const [resource, id, sub] = segments
  const numericId = Number(id)

  if (resource === 'auth') {
    if (method === 'POST' && id === 'register') {
      const email = String(bodyValue(body, 'email', '')).trim().toLowerCase()
      const password = String(bodyValue(body, 'password', ''))
      if (!email.includes('@')) fail(400, 'invalid_email', 'Enter a valid email address.', { email: 'Enter a valid email address.' })
      if (password.length < 8) {
        fail(400, 'weak_password', 'Use at least 8 characters.', { password: 'Use at least 8 characters.' })
      }
      if (state.users.some((user) => user.email.toLowerCase() === email)) {
        fail(409, 'email_taken', 'That email already has an account.', { email: 'That email already has an account.' })
      }
      const user = {
        id: nextId(state.users),
        email,
        password,
        display_name: String(bodyValue(body, 'display_name', '')),
        base_currency: 'PHP',
        timezone: 'Asia/Manila',
        email_verified_at: null,
        otp_hash: DEMO_OTP,
        otp_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        otp_attempts: 0,
        created_at: new Date().toISOString(),
        deleted_at: null,
      }
      state.users.push(user)
      save(state)
      return { status: 'otp_required', email: user.email }
    }

    if (method === 'POST' && id === 'verify-otp') {
      const email = String(bodyValue(body, 'email', '')).trim().toLowerCase()
      const code = String(bodyValue(body, 'code', '')).trim()
      const user = state.users.find((item) => item.email.toLowerCase() === email)
      if (!user) fail(400, 'invalid_code', 'That code does not match. Request a new one.')
      if (user.email_verified_at) fail(400, 'already_verified', 'This email is already verified. Sign in instead.')
      if (user.otp_expires_at && new Date(user.otp_expires_at).getTime() < Date.now()) {
        fail(400, 'code_expired', 'That code expired. Request a new one.')
      }
      if (user.otp_attempts >= MAX_OTP_ATTEMPTS) {
        fail(429, 'too_many_attempts', 'Too many attempts. Request a new code.')
      }
      user.otp_attempts += 1
      if (code !== user.otp_hash) {
        save(state)
        fail(400, 'invalid_code', 'That code does not match. Try again.')
      }
      user.email_verified_at = new Date().toISOString()
      user.otp_hash = null
      user.otp_expires_at = null
      user.otp_attempts = 0
      save(state)
      localStorage.setItem(SESSION_KEY, String(user.id))
      return { user: publicUser(user) }
    }

    if (method === 'POST' && id === 'login') {
      const email = String(bodyValue(body, 'email', '')).trim().toLowerCase()
      const password = String(bodyValue(body, 'password', ''))
      const user = state.users.find((item) => item.email.toLowerCase() === email && !item.deleted_at)
      if (!user || user.password !== password) {
        fail(401, 'invalid_credentials', 'Email or password is incorrect.')
      }
      if (!user.email_verified_at) {
        fail(403, 'email_unverified', 'Verify your email before signing in.', { email: user.email })
      }
      localStorage.setItem(SESSION_KEY, String(user.id))
      return { user: publicUser(user) }
    }

    if (method === 'POST' && id === 'logout') {
      localStorage.removeItem(SESSION_KEY)
      return null
    }

    if (method === 'POST' && id === 'resend-otp') {
      const email = String(bodyValue(body, 'email', '')).trim().toLowerCase()
      const user = state.users.find((item) => item.email.toLowerCase() === email)
      if (user && !user.email_verified_at) {
        user.otp_attempts = 0
        user.otp_expires_at = new Date(Date.now() + 10 * 60_000).toISOString()
        save(state)
      }
      return { sent: true }
    }

    if (method === 'GET' && id === 'me') {
      return { user: publicUser(currentUser(state)) }
    }

    fail(404, 'not_found', 'Unknown auth route.')
  }

  const user = currentUser(state)

  if (resource === 'accounts') {
    if (method === 'GET') {
      return state.accounts
        .filter((account) => account.user_id === user.id && !account.deleted_at)
        .map((account) => ({ ...account, balance_cents: accountBalance(state, account) }))
        .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
    }
    if (method === 'POST') {
      const account = {
        id: nextId(state.accounts),
        user_id: user.id,
        name: String(bodyValue(body, 'name', '')).trim(),
        type: bodyValue(body, 'type', 'asset'),
        subtype: bodyValue(body, 'subtype', 'other'),
        currency: 'PHP',
        opening_balance_cents: Number(bodyValue(body, 'opening_balance_cents', 0)),
        is_active: bodyValue(body, 'is_active', 1) ? 1 : 0,
        created_at: new Date().toISOString(),
        deleted_at: null,
      }
      if (!account.name) fail(400, 'invalid_account', 'Give the account a name.', { name: 'Give the account a name.' })
      state.accounts.push(account)
      save(state)
      return { ...account, balance_cents: account.opening_balance_cents }
    }
    if (method === 'PATCH') {
      const account = state.accounts.find((item) => item.id === numericId && item.user_id === user.id && !item.deleted_at)
      if (!account) fail(404, 'not_found', 'Account not found.')
      for (const key of ['name', 'type', 'subtype', 'opening_balance_cents', 'is_active']) {
        if (body && body[key] !== undefined) account[key] = body[key]
      }
      account.is_active = account.is_active ? 1 : 0
      save(state)
      return { ...account, balance_cents: accountBalance(state, account) }
    }
    if (method === 'DELETE') {
      const account = state.accounts.find((item) => item.id === numericId && item.user_id === user.id && !item.deleted_at)
      if (!account) fail(404, 'not_found', 'Account not found.')
      const referenced =
        state.transactions.some((tx) => tx.account_id === account.id && !tx.deleted_at) ||
        state.goal_allocations.some((item) => item.account_id === account.id && !item.deleted_at) ||
        state.goals.some((goal) => goal.linked_account_id === account.id && !goal.deleted_at) ||
        state.subscriptions.some((item) => item.account_id === account.id && !item.deleted_at) ||
        state.debts.some((item) => item.account_id === account.id && !item.deleted_at)
      if (referenced) {
        fail(409, 'account_in_use', 'Archive it instead — transactions, goals or subscriptions still use this account.')
      }
      account.deleted_at = new Date().toISOString()
      save(state)
      return null
    }
  }

  if (resource === 'categories') {
    if (method === 'GET') {
      return state.categories
        .filter((category) => category.user_id === user.id && !category.deleted_at)
        .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
    }
    if (method === 'POST') {
      const name = String(bodyValue(body, 'name', '')).trim()
      const duplicate = state.categories.some(
        (category) => category.user_id === user.id && category.name.toLowerCase() === name.toLowerCase(),
      )
      if (duplicate) {
        fail(409, 'category_exists', 'That name is already taken, including archived categories.', {
          name: 'That name is already taken, including archived categories.',
        })
      }
      const category = {
        id: nextId(state.categories),
        user_id: user.id,
        name,
        type: bodyValue(body, 'type', 'needs'),
        parent_id: bodyValue(body, 'parent_id', null) ? Number(bodyValue(body, 'parent_id')) : null,
        color: bodyValue(body, 'color', '#4f6b57'),
        is_active: 1,
        created_at: new Date().toISOString(),
        deleted_at: null,
      }
      if (!category.name) fail(400, 'invalid_category', 'Give the category a name.', { name: 'Give the category a name.' })
      state.categories.push(category)
      save(state)
      return category
    }
    if (method === 'PATCH') {
      const category = state.categories.find((item) => item.id === numericId && item.user_id === user.id && !item.deleted_at)
      if (!category) fail(404, 'not_found', 'Category not found.')
      for (const key of ['name', 'type', 'parent_id', 'color', 'is_active']) {
        if (body && body[key] !== undefined) {
          category[key] = key === 'parent_id' && body[key] ? Number(body[key]) : body[key]
        }
      }
      save(state)
      return category
    }
    if (method === 'DELETE') {
      const category = state.categories.find((item) => item.id === numericId && item.user_id === user.id && !item.deleted_at)
      if (!category) fail(404, 'not_found', 'Category not found.')
      const referenced =
        state.transactions.some((tx) => tx.category_id === category.id && !tx.deleted_at) ||
        state.budgets.some((budget) => budget.category_id === category.id && !budget.deleted_at) ||
        state.subscriptions.some((item) => item.category_id === category.id && !item.deleted_at)
      if (referenced) fail(409, 'category_in_use', 'Move its transactions and budgets first, or rename it instead.')
      category.deleted_at = new Date().toISOString()
      save(state)
      return null
    }
  }

  if (resource === 'transactions') {
    if (method === 'GET') {
      const from = params.get('from')
      const to = params.get('to')
      const accountId = params.get('account_id') ? Number(params.get('account_id')) : null
      const categoryIdValue = params.get('category_id') ? Number(params.get('category_id')) : null
      const query = (params.get('q') || '').trim().toLowerCase()
      const page = Math.max(1, Number(params.get('page') || 1))
      const pageSize = Math.min(100, Math.max(1, Number(params.get('page_size') || 20)))

      const filtered = state.transactions
        .filter((tx) => tx.user_id === user.id && !tx.deleted_at)
        .filter((tx) => !from || tx.occurred_at.slice(0, 10) >= from)
        .filter((tx) => !to || tx.occurred_at.slice(0, 10) <= to)
        .filter((tx) => !accountId || tx.account_id === accountId)
        .filter((tx) => !categoryIdValue || tx.category_id === categoryIdValue)
        .filter((tx) => {
          if (!query) return true
          const enriched = enrichTransaction(state, tx)
          return [enriched.description, enriched.account_name, enriched.category_name]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query))
        })
        .sort((a, b) =>
          a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : b.id - a.id,
        )

      const start = (page - 1) * pageSize
      return {
        items: filtered.slice(start, start + pageSize).map((tx) => enrichTransaction(state, tx)),
        total: filtered.length,
        page,
        page_size: pageSize,
      }
    }
    if (method === 'POST') {
      const amount = Number(bodyValue(body, 'amount_cents', 0))
      if (!amount) fail(400, 'invalid_amount', 'Enter an amount greater than zero.', { amount_cents: 'Enter an amount greater than zero.' })
      const tx = {
        id: nextId(state.transactions),
        user_id: user.id,
        account_id: Number(bodyValue(body, 'account_id')),
        category_id: bodyValue(body, 'category_id', null) ? Number(bodyValue(body, 'category_id')) : null,
        amount_cents: amount,
        currency: 'PHP',
        occurred_at: bodyValue(body, 'occurred_at', new Date().toISOString()),
        description: String(bodyValue(body, 'description', '')).trim(),
        transfer_group_id: null,
        parent_transaction_id: null,
        created_at: new Date().toISOString(),
        deleted_at: null,
      }
      if (!tx.account_id) fail(400, 'invalid_account', 'Choose an account.', { account_id: 'Choose an account.' })
      state.transactions.push(tx)
      save(state)
      return enrichTransaction(state, tx)
    }
    if (method === 'PATCH') {
      const tx = state.transactions.find((item) => item.id === numericId && item.user_id === user.id && !item.deleted_at)
      if (!tx) fail(404, 'not_found', 'Transaction not found.')
      if (tx.transfer_group_id) fail(409, 'transfer_locked', 'Transfers can only be deleted, not edited.')
      for (const key of ['account_id', 'category_id', 'amount_cents', 'occurred_at', 'description']) {
        if (body && body[key] !== undefined) {
          tx[key] = ['account_id', 'category_id', 'amount_cents'].includes(key) && body[key] !== null
            ? Number(body[key])
            : body[key]
        }
      }
      save(state)
      return enrichTransaction(state, tx)
    }
    if (method === 'DELETE') {
      const tx = state.transactions.find((item) => item.id === numericId && item.user_id === user.id && !item.deleted_at)
      if (!tx) fail(404, 'not_found', 'Transaction not found.')
      const stamp = new Date().toISOString()
      if (tx.transfer_group_id) {
        for (const leg of state.transactions.filter((item) => item.transfer_group_id === tx.transfer_group_id)) {
          leg.deleted_at = stamp
        }
      } else {
        tx.deleted_at = stamp
      }
      save(state)
      return null
    }
  }

  if (resource === 'transfers' && method === 'POST') {
    const fromId = Number(bodyValue(body, 'from_account_id'))
    const toId = Number(bodyValue(body, 'to_account_id'))
    const amount = Math.abs(Number(bodyValue(body, 'amount_cents', 0)))
    const occurredAt = bodyValue(body, 'occurred_at', new Date().toISOString())
    if (!fromId || !toId || fromId === toId) {
      fail(400, 'invalid_transfer', 'Choose two different accounts.', { to_account_id: 'Pick a different account.' })
    }
    if (!amount) fail(400, 'invalid_amount', 'Enter an amount greater than zero.', { amount_cents: 'Enter an amount greater than zero.' })
    const from = state.accounts.find((item) => item.id === fromId && !item.deleted_at)
    const to = state.accounts.find((item) => item.id === toId && !item.deleted_at)
    if (!from || !to) fail(404, 'not_found', 'One of the accounts no longer exists.')
    const group = globalThis.crypto?.randomUUID?.() ?? `transfer-${Date.now()}`
    const base = {
      user_id: user.id,
      category_id: null,
      currency: 'PHP',
      occurred_at: occurredAt,
      transfer_group_id: group,
      parent_transaction_id: null,
      created_at: new Date().toISOString(),
      deleted_at: null,
    }
    const description = String(bodyValue(body, 'description', '')).trim()
    const legs = [
      {
        ...base,
        id: nextId(state.transactions),
        account_id: fromId,
        amount_cents: -amount,
        description: description || `Transfer to ${to.name}`,
      },
      {
        ...base,
        id: nextId(state.transactions) + 1,
        account_id: toId,
        amount_cents: amount,
        description: description || `Transfer from ${from.name}`,
      },
    ]
    state.transactions.push(...legs)
    save(state)
    return { transfer_group_id: group, legs: legs.map((leg) => enrichTransaction(state, leg)) }
  }

  if (resource === 'budgets') {
    if (method === 'GET') {
      const month = params.get('month') || currentMonthKey()
      return budgetRows(state, month)
    }
    if (method === 'POST') {
      const categoryIdValue = Number(bodyValue(body, 'category_id'))
      const range = monthRange(bodyValue(body, 'month', currentMonthKey()))
      const limit = Number(bodyValue(body, 'limit_cents', 0))
      if (!categoryIdValue) fail(400, 'invalid_budget', 'Choose a category.', { category_id: 'Choose a category.' })
      if (limit <= 0) fail(400, 'invalid_limit', 'Set a limit greater than zero.', { limit_cents: 'Set a limit greater than zero.' })
      const budget = {
        id: nextId(state.budgets),
        user_id: user.id,
        category_id: categoryIdValue,
        period_start: range.start,
        period_end: range.end,
        limit_cents: limit,
        rollover: bodyValue(body, 'rollover', 0) ? 1 : 0,
        created_at: new Date().toISOString(),
        deleted_at: null,
      }
      state.budgets.push(budget)
      save(state)
      return budget
    }
    if (method === 'PATCH') {
      const budget = state.budgets.find((item) => item.id === numericId && item.user_id === user.id && !item.deleted_at)
      if (!budget) fail(404, 'not_found', 'Budget not found.')
      for (const key of ['limit_cents', 'rollover', 'category_id']) {
        if (body && body[key] !== undefined) {
          budget[key] = ['limit_cents', 'category_id'].includes(key) ? Number(body[key]) : body[key] ? 1 : 0
        }
      }
      save(state)
      return budget
    }
    if (method === 'DELETE') {
      const budget = state.budgets.find((item) => item.id === numericId && item.user_id === user.id && !item.deleted_at)
      if (!budget) fail(404, 'not_found', 'Budget not found.')
      budget.deleted_at = new Date().toISOString()
      save(state)
      return null
    }
  }

  if (resource === 'goals') {
    if (method === 'GET' && !id) return goalRows(state)
    if (method === 'POST' && !id) {
      const goal = {
        id: nextId(state.goals),
        user_id: user.id,
        name: String(bodyValue(body, 'name', '')).trim(),
        target_cents: Number(bodyValue(body, 'target_cents', 0)),
        target_date: bodyValue(body, 'target_date', null),
        linked_account_id: bodyValue(body, 'linked_account_id', null)
          ? Number(bodyValue(body, 'linked_account_id'))
          : null,
        status: 'active',
        created_at: new Date().toISOString(),
        deleted_at: null,
      }
      if (!goal.name) fail(400, 'invalid_goal', 'Name the goal.', { name: 'Name the goal.' })
      state.goals.push(goal)
      save(state)
      return goal
    }
    if (method === 'PATCH' && id) {
      const goal = state.goals.find((item) => item.id === numericId && item.user_id === user.id && !item.deleted_at)
      if (!goal) fail(404, 'not_found', 'Goal not found.')
      for (const key of ['name', 'target_cents', 'target_date', 'linked_account_id', 'status']) {
        if (body && body[key] !== undefined) {
          goal[key] = ['target_cents', 'linked_account_id'].includes(key) && body[key] !== null
            ? Number(body[key])
            : body[key]
        }
      }
      save(state)
      return goal
    }
    if (method === 'DELETE' && id && !sub) {
      const goal = state.goals.find((item) => item.id === numericId && item.user_id === user.id && !item.deleted_at)
      if (!goal) fail(404, 'not_found', 'Goal not found.')
      goal.deleted_at = new Date().toISOString()
      for (const allocation of state.goal_allocations.filter((item) => item.goal_id === goal.id)) {
        allocation.deleted_at = allocation.deleted_at || goal.deleted_at
      }
      save(state)
      return null
    }
    if (method === 'POST' && id && sub === 'allocations') {
      const goal = state.goals.find((item) => item.id === numericId && item.user_id === user.id && !item.deleted_at)
      if (!goal) fail(404, 'not_found', 'Goal not found.')
      const amount = Number(bodyValue(body, 'amount_cents', 0))
      if (!amount) fail(400, 'invalid_amount', 'Enter an amount greater than zero.', { amount_cents: 'Enter an amount greater than zero.' })
      const allocation = {
        id: nextId(state.goal_allocations),
        user_id: user.id,
        goal_id: goal.id,
        account_id: Number(bodyValue(body, 'account_id', 1)),
        amount_cents: amount,
        allocated_at: bodyValue(body, 'allocated_at', new Date().toISOString()),
        note: String(bodyValue(body, 'note', '')).trim() || null,
        deleted_at: null,
      }
      state.goal_allocations.push(allocation)
      save(state)
      return allocation
    }
  }

  if (resource === 'debts') {
    if (method === 'GET') {
      return state.debts
        .filter((debt) => debt.user_id === user.id && !debt.deleted_at)
        .sort((a, b) => b.current_balance_cents - a.current_balance_cents)
    }
    if (method === 'POST') {
      const debt = {
        id: nextId(state.debts),
        user_id: user.id,
        name: String(bodyValue(body, 'name', '')).trim(),
        account_id: bodyValue(body, 'account_id', null) ? Number(bodyValue(body, 'account_id')) : null,
        principal_cents: Number(bodyValue(body, 'principal_cents', 0)),
        current_balance_cents: Number(bodyValue(body, 'current_balance_cents', 0)),
        interest_rate_bps: Number(bodyValue(body, 'interest_rate_bps', 0)),
        minimum_payment_cents: Number(bodyValue(body, 'minimum_payment_cents', 0)),
        due_day: Number(bodyValue(body, 'due_day', 1)),
        created_at: new Date().toISOString(),
        deleted_at: null,
      }
      if (!debt.name) fail(400, 'invalid_debt', 'Name the debt.', { name: 'Name the debt.' })
      state.debts.push(debt)
      save(state)
      return debt
    }
    if (method === 'PATCH') {
      const debt = state.debts.find((item) => item.id === numericId && item.user_id === user.id && !item.deleted_at)
      if (!debt) fail(404, 'not_found', 'Debt not found.')
      for (const key of ['name', 'account_id', 'principal_cents', 'current_balance_cents', 'interest_rate_bps', 'minimum_payment_cents', 'due_day']) {
        if (body && body[key] !== undefined) {
          debt[key] = ['account_id', 'principal_cents', 'current_balance_cents', 'interest_rate_bps', 'minimum_payment_cents', 'due_day'].includes(key) && body[key] !== null
            ? Number(body[key])
            : body[key]
        }
      }
      save(state)
      return debt
    }
    if (method === 'DELETE') {
      const debt = state.debts.find((item) => item.id === numericId && item.user_id === user.id && !item.deleted_at)
      if (!debt) fail(404, 'not_found', 'Debt not found.')
      debt.deleted_at = new Date().toISOString()
      save(state)
      return null
    }
  }

  if (resource === 'subscriptions') {
    if (method === 'GET') return subscriptionRows(state)
    if (method === 'POST') {
      const subscription = {
        id: nextId(state.subscriptions),
        user_id: user.id,
        name: String(bodyValue(body, 'name', '')).trim(),
        amount_cents: Number(bodyValue(body, 'amount_cents', 0)),
        currency: 'PHP',
        billing_cycle: bodyValue(body, 'billing_cycle', 'monthly'),
        next_due_date: bodyValue(body, 'next_due_date', todayKey()),
        account_id: bodyValue(body, 'account_id', null) ? Number(bodyValue(body, 'account_id')) : null,
        category_id: bodyValue(body, 'category_id', null) ? Number(bodyValue(body, 'category_id')) : null,
        is_active: 1,
        created_at: new Date().toISOString(),
        deleted_at: null,
      }
      if (!subscription.name) fail(400, 'invalid_subscription', 'Name the subscription.', { name: 'Name the subscription.' })
      if (subscription.amount_cents <= 0) {
        fail(400, 'invalid_amount', 'Enter an amount greater than zero.', { amount_cents: 'Enter an amount greater than zero.' })
      }
      state.subscriptions.push(subscription)
      save(state)
      return subscription
    }
    if (method === 'PATCH') {
      const subscription = state.subscriptions.find((item) => item.id === numericId && item.user_id === user.id && !item.deleted_at)
      if (!subscription) fail(404, 'not_found', 'Subscription not found.')
      for (const key of ['name', 'amount_cents', 'billing_cycle', 'next_due_date', 'account_id', 'category_id', 'is_active']) {
        if (body && body[key] !== undefined) {
          subscription[key] = ['amount_cents', 'account_id', 'category_id'].includes(key) && body[key] !== null
            ? Number(body[key])
            : body[key]
        }
      }
      subscription.is_active = subscription.is_active ? 1 : 0
      save(state)
      return subscription
    }
    if (method === 'DELETE') {
      const subscription = state.subscriptions.find((item) => item.id === numericId && item.user_id === user.id && !item.deleted_at)
      if (!subscription) fail(404, 'not_found', 'Subscription not found.')
      subscription.deleted_at = new Date().toISOString()
      save(state)
      return null
    }
  }

  if (resource === 'reports') {
    if (method === 'GET' && id === 'summary') {
      return summary(state, params.get('month') || currentMonthKey())
    }
    if (method === 'GET' && id === 'net-worth') {
      const months = Math.min(24, Math.max(2, Number(params.get('months') || 6)))
      const endMonth = params.get('end') || currentMonthKey()
      return lastNMonths(months, endMonth).map((month) => ({
        month,
        ...netWorth(state, monthRange(month).end),
      }))
    }
    if (method === 'GET' && id === 'cashflow') {
      const months = Math.min(24, Math.max(2, Number(params.get('months') || 6)))
      const endMonth = params.get('end') || currentMonthKey()
      return lastNMonths(months, endMonth).map((month) => ({
        month,
        ...monthCashflow(state, month),
      }))
    }
  }

  fail(404, 'not_found', `No mock route for ${method} ${path}`)
}

export async function mockRequest(method, path, body) {
  if (import.meta.env.MODE !== 'test') {
    await new Promise((resolve) => setTimeout(resolve, 90))
  }
  return route(method, path, body)
}

export function resetDemo() {
  localStorage.removeItem(STORE_KEY)
  localStorage.removeItem(SESSION_KEY)
}
