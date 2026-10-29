import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../api.js'
import { Card, CardHeader } from '../components/Card.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorState } from '../components/ErrorState.jsx'
import { ProgressBar } from '../components/ProgressBar.jsx'
import { Money } from '../components/Money.jsx'
import { PageHeader } from '../components/PageHeader.jsx'
import { SkeletonStack } from '../components/Loading.jsx'
import { formatDate, formatMonth, currentMonthKey, dateKeyInTz, relativeDays, todayKey } from '../lib/dates.js'
import { formatMoney, percentOf } from '../lib/money.js'
import { useResource } from '../lib/useResource.js'

const INK = '#10231c'
const CREDIT = '#1f6b4a'
const DEBIT = '#a33a2b'
const RULE = '#b9c9c0'
const STAMP = '#3b4c8a'

function ChartTooltip({ active, payload, label, money = true }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__label">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="chart-tooltip__row">
          <span style={{ background: entry.color }} aria-hidden="true" />
          {entry.name}
          <strong>{money ? formatMoney(entry.value) : entry.value}</strong>
        </p>
      ))}
    </div>
  )
}

const monthTick = (month) => {
  const [year, value] = String(month).split('-')
  return new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(Number(year), Number(value) - 1, 1)),
  )
}

export function Dashboard() {
  const month = currentMonthKey()
  const { data, loading, error, reload } = useResource(async () => {
    const [summary, worth, cashflow, budgetRows] = await Promise.all([
      api.reports.summary(month),
      api.reports.netWorth(6),
      api.reports.cashflow(6),
      api.budgets.list(month),
    ])
    return { summary, worth, cashflow, budgetRows }
  }, [month])

  if (loading && !data) {
    return (
      <div className="page">
        <PageHeader eyebrow={formatMonth(month)} title="Net position" />
        <div className="dash-grid">
          <Card className="dash-span-7">
            <SkeletonStack rows={4} />
          </Card>
          <Card className="dash-span-5">
            <SkeletonStack rows={4} />
          </Card>
          <Card className="dash-span-7">
            <SkeletonStack rows={6} />
          </Card>
          <Card className="dash-span-5">
            <SkeletonStack rows={6} />
          </Card>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <PageHeader eyebrow={formatMonth(month)} title="Net position" />
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  const { summary, worth, cashflow, budgetRows } = data
  const budgets = summary.budget_limit_cents
    ? percentOf(summary.budget_spent_cents, summary.budget_limit_cents)
    : 0

  return (
    <div className="page">
      <PageHeader
        eyebrow={formatMonth(month)}
        title="Net position"
        description="What the ledger says today, before the month gets away."
        actions={
          <Link className="btn btn--primary btn--md" to="/transactions">
            Record a transaction
          </Link>
        }
      />

      <div className="dash-grid">
        <Card className="dash-span-7 net-card">
          <span className="stamp">As of {formatDate(todayKey())}</span>
          <p className="eyebrow">Assets minus liabilities</p>
          <p className="net-card__value">
            <Money value={summary.net_worth_cents} />
          </p>
          <div className="net-card__split">
            <div>
              <p className="stat-label">Assets</p>
              <p className="stat-value">
                <Money value={summary.assets_cents} />
              </p>
            </div>
            <div>
              <p className="stat-label">Liabilities</p>
              <p className="stat-value">
                <Money value={summary.liabilities_cents} />
              </p>
            </div>
            <div>
              <p className="stat-label">This month</p>
              <p className="stat-value">
                <Money value={summary.month_income_cents - summary.month_expense_cents} signed />
              </p>
            </div>
          </div>
          <div className="net-card__flow">
            <span>
              In <Money value={summary.month_income_cents} className="money--credit" />
            </span>
            <span className="perf" aria-hidden="true" />
            <span>
              Out <Money value={-summary.month_expense_cents} className="money--debit" />
            </span>
          </div>
        </Card>

        <Card className="dash-span-5">
          <CardHeader
            eyebrow="Envelopes"
            title="Budget left this month"
            actions={
              <Link className="text-link" to="/budgets">
                Open
              </Link>
            }
          />
          {summary.budget_limit_cents ? (
            <>
              <div className="budget-headline">
                <Money value={summary.budget_limit_cents - summary.budget_spent_cents} />
                <span>of {formatMoney(summary.budget_limit_cents)} left</span>
              </div>
              <ProgressBar
                value={budgets}
                tone={budgets > 100 ? 'debit' : budgets > 80 ? 'warn' : 'credit'}
                label="Budget used"
              />
              <p className="budget-caption">{budgets}% of the month's envelopes used</p>
              {budgetRows.length ? (
                <ul className="budget-mini-list">
                  {budgetRows.slice(0, 4).map((budget) => {
                    const over = budget.spent_cents > budget.limit_cents
                    return (
                      <li key={budget.id} className="budget-mini">
                        <div className="budget-mini__head">
                          <span>{budget.category_name}</span>
                          <span className="mono">{budget.progress_pct}%</span>
                        </div>
                        <ProgressBar
                          value={budget.progress_pct}
                          tone={over ? 'debit' : budget.progress_pct > 80 ? 'warn' : 'credit'}
                          label={`${budget.category_name} budget used`}
                        />
                        <p className="budget-mini__meta">
                          <Money value={budget.spent_cents} /> of <Money value={budget.limit_cents} />
                        </p>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon="trending"
              title="No budgets yet"
              description="Give each category a limit and the month gets easier to read."
              action={
                <Link className="text-link" to="/budgets">
                  Set a budget
                </Link>
              }
            />
          )}
        </Card>

        <Card className="dash-span-7">
          <CardHeader eyebrow="Six months" title="Net worth" subtitle="Month-end balances, liabilities subtracted." />
          <div className="chart">
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={worth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={STAMP} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={STAMP} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={RULE} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={monthTick}
                  tick={{ fill: INK, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(value) => formatMoney(value, { compact: true })}
                  tick={{ fill: INK, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                />
                <Tooltip content={<ChartTooltip />} labelFormatter={formatMonth} />
                <Area
                  type="monotone"
                  dataKey="net_worth_cents"
                  name="Net worth"
                  stroke={STAMP}
                  strokeWidth={2}
                  fill="url(#netWorthFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="dash-span-5">
          <CardHeader eyebrow="Six months" title="Cash flow" subtitle="Income against spending." />
          <div className="chart">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={cashflow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={RULE} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={monthTick}
                  tick={{ fill: INK, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(value) => formatMoney(value, { compact: true })}
                  tick={{ fill: INK, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  axisLine={false}
                  tickLine={false}
                  width={58}
                />
                <Tooltip content={<ChartTooltip />} labelFormatter={formatMonth} />
                <Bar dataKey="income_cents" name="Income" fill={CREDIT} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="expense_cents" name="Spent" fill={DEBIT} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="dash-span-5">
          <CardHeader
            eyebrow="Next 30 days"
            title="Subscriptions"
            actions={
              <Link className="text-link" to="/subscriptions">
                All
              </Link>
            }
          />
          {summary.upcoming_subscriptions.length ? (
            <ul className="ledger-list">
              {summary.upcoming_subscriptions.map((subscription) => (
                <li key={subscription.id} className="ledger-row">
                  <div className="ledger-row__main">
                    <span>{subscription.name}</span>
                    <small>{relativeDays(subscription.next_due_date)}</small>
                  </div>
                  <Money value={subscription.amount_cents} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="repeat" title="Nothing due soon" description="No subscriptions renew in the next 30 days." />
          )}
        </Card>

        <Card className="dash-span-7">
          <CardHeader
            eyebrow="In progress"
            title="Goals"
            actions={
              <Link className="text-link" to="/goals">
                Open
              </Link>
            }
          />
          {summary.goals.length ? (
            <ul className="goal-mini-list">
              {summary.goals.map((goal) => (
                <li key={goal.id} className="goal-mini">
                  <div className="goal-mini__head">
                    <span>{goal.name}</span>
                    <span className="mono">{goal.progress_pct ?? 0}%</span>
                  </div>
                  <ProgressBar value={goal.progress_pct ?? 0} label={`${goal.name} progress`} />
                  <p className="goal-mini__meta">
                    <Money value={goal.allocated_cents} /> of <Money value={goal.target_cents} />
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="target" title="No active goals" description="Name the thing you are saving for and track it here." />
          )}
        </Card>

        <Card className="dash-span-12">
          <CardHeader
            eyebrow="Passbook"
            title="Latest entries"
            actions={
              <Link className="text-link" to="/transactions">
                Full ledger
              </Link>
            }
          />
          {summary.recent_transactions.length ? (
            <div className="passbook">
              {summary.recent_transactions.map((transaction) => (
                <div key={transaction.id} className="passbook__row">
                  <span className="passbook__date">{formatDate(dateKeyInTz(new Date(transaction.occurred_at)))}</span>
                  <span className="passbook__desc">
                    {transaction.description || 'No description'}
                    <small>
                      {transaction.category_name || 'Uncategorized'} · {transaction.account_name}
                    </small>
                  </span>
                  <span className="passbook__dots" aria-hidden="true" />
                  <Money value={transaction.amount_cents} signed />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="transactions"
              title="The ledger is empty"
              description="Record the first transaction and this page starts telling the story."
              action={
                <Link className="text-link" to="/transactions">
                  Add a transaction
                </Link>
              }
            />
          )}
        </Card>
      </div>
    </div>
  )
}
