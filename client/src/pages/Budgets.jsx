import { useState } from 'react'
import { api } from '../api.js'
import { Button } from '../components/Button.jsx'
import { Card } from '../components/Card.jsx'
import { ConfirmDialog } from '../components/ConfirmDialog.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorState } from '../components/ErrorState.jsx'
import { Field, FormError, Input, MoneyInput, Select } from '../components/Form.jsx'
import { LoadingPage } from '../components/Loading.jsx'
import { Modal } from '../components/Modal.jsx'
import { Money } from '../components/Money.jsx'
import { PageHeader } from '../components/PageHeader.jsx'
import { ProgressBar } from '../components/ProgressBar.jsx'
import { useToast } from '../components/Toast.jsx'
import { BUDGETABLE_CATEGORY_TYPES } from '../lib/constants.js'
import { currentMonthKey, formatMonth } from '../lib/dates.js'
import { errorMessage, fieldErrors } from '../lib/errors.js'
import { centsToInput, formatMoney, parseMoney } from '../lib/money.js'
import { useResource } from '../lib/useResource.js'
import { hasErrors, validateBudget } from '../lib/validation.js'

function BudgetEditor({ budget, month, categories, budgets, onClose, onSaved }) {
  const [form, setForm] = useState({
    category_id: budget ? String(budget.category_id) : '',
    limit: budget ? centsToInput(budget.limit_cents) : '',
    month,
    rollover: budget ? Boolean(budget.rollover) : false,
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const options = categories
    .filter((category) => BUDGETABLE_CATEGORY_TYPES.includes(category.type))
    .filter(
      (category) =>
        category.id === budget?.category_id ||
        !budgets.some((item) => String(item.category_id) === String(category.id)),
    )
    .map((category) => ({ value: category.id, label: category.name }))

  const submit = async (event) => {
    event.preventDefault()
    setFormError(null)
    const nextErrors = validateBudget(form)
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return

    setBusy(true)
    try {
      const payload = {
        category_id: Number(form.category_id),
        limit_cents: parseMoney(form.limit),
        rollover: form.rollover ? 1 : 0,
      }
      if (budget) await api.budgets.update(budget.id, payload)
      else await api.budgets.create({ ...payload, month: form.month })
      onSaved()
    } catch (caught) {
      setErrors(fieldErrors(caught))
      setFormError(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={budget ? 'Edit budget' : 'New budget'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {budget ? 'Save changes' : 'Set budget'}
          </Button>
        </>
      }
    >
      <form className="form" onSubmit={submit} noValidate>
        {budget ? null : (
          <Field label="Month" htmlFor="budget-month" error={errors.month}>
            <Input
              id="budget-month"
              type="month"
              value={form.month}
              onChange={(event) => setForm({ ...form, month: event.target.value })}
            />
          </Field>
        )}
        <Field label="Category" htmlFor="budget-category" error={errors.category_id}>
          <Select
            id="budget-category"
            value={form.category_id}
            onChange={(event) => setForm({ ...form, category_id: event.target.value })}
            options={options}
            placeholder="Choose a category"
          />
        </Field>
        <Field label="Limit" htmlFor="budget-limit" error={errors.limit}>
          <MoneyInput
            id="budget-limit"
            value={form.limit}
            onChange={(value) => setForm({ ...form, limit: value })}
          />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={form.rollover}
            onChange={(event) => setForm({ ...form, rollover: event.target.checked })}
          />
          <span>Roll over what is left into next month</span>
        </label>
        <FormError>{formError ? errorMessage(formError) : null}</FormError>
      </form>
    </Modal>
  )
}

export function Budgets() {
  const notify = useToast()
  const [month, setMonth] = useState(currentMonthKey())
  const [editor, setEditor] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const { data, loading, error, reload } = useResource(async () => {
    const [budgets, categories] = await Promise.all([
      api.budgets.list(month),
      api.categories.list(),
    ])
    return { budgets, categories }
  }, [month])

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.budgets.remove(pendingDelete.id)
      notify('Budget removed.')
      setPendingDelete(null)
      reload()
    } catch (caught) {
      setPendingDelete(null)
      notify(errorMessage(caught), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const budgets = data?.budgets ?? []
  const categories = data?.categories ?? []
  const totalLimit = budgets.reduce((total, budget) => total + budget.limit_cents, 0)
  const totalSpent = budgets.reduce((total, budget) => total + budget.spent_cents, 0)
  const totalLeft = totalLimit - totalSpent

  return (
    <div className="page">
      <PageHeader
        eyebrow="Planning"
        title="Budgets"
        description="Give the month a ceiling before it decides for you."
        actions={
          <Button onClick={() => setEditor({ budget: null })} disabled={!categories.length}>
            New budget
          </Button>
        }
      />

      <Card className="month-bar">
        <Field label="Month" htmlFor="budget-month-filter">
          <Input
            id="budget-month-filter"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value || currentMonthKey())}
          />
        </Field>
        <p className="month-bar__label">{formatMonth(month)}</p>
        {month !== currentMonthKey() ? (
          <Button variant="ghost" size="sm" onClick={() => setMonth(currentMonthKey())}>
            Back to this month
          </Button>
        ) : null}
      </Card>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingPage label="Loading budgets" />
      ) : budgets.length === 0 ? (
        <Card>
          <EmptyState
            icon="trending"
            title={`No budgets for ${formatMonth(month)}`}
            description="Pick a category, set a ceiling, and this page starts tracking spending against it."
            action={
              <Button onClick={() => setEditor({ budget: null })} disabled={!categories.length}>
                Set a budget
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="budget-summary">
            <div>
              <p className="stat-label">Budgeted</p>
              <p className="stat-value stat-value--lg">
                <Money value={totalLimit} />
              </p>
            </div>
            <div>
              <p className="stat-label">Spent</p>
              <p className="stat-value stat-value--lg">
                <Money value={totalSpent} />
              </p>
            </div>
            <div>
              <p className="stat-label">{totalLeft < 0 ? 'Over budget' : 'Left'}</p>
              <p className={`stat-value stat-value--lg ${totalLeft < 0 ? 'is-debit' : ''}`}>
                <Money value={Math.abs(totalLeft)} />
              </p>
            </div>
          </div>

          <div className="budget-grid">
            {budgets.map((budget) => {
              const over = budget.spent_cents > budget.limit_cents
              return (
                <Card key={budget.id} className={`budget-card ${over ? 'is-over' : ''}`.trim()}>
                  <div className="budget-card__head">
                    <span
                      className="category-row__swatch"
                      style={{ background: budget.category_color || 'var(--rule)' }}
                      aria-hidden="true"
                    />
                    <div className="budget-card__title">
                      <h2>{budget.category_name}</h2>
                      <p>{formatMonth(month)}</p>
                    </div>
                    {budget.rollover ? <span className="badge">Rolls over</span> : null}
                    {over ? <span className="badge badge--debit">Over</span> : null}
                  </div>

                  <p className="budget-card__numbers">
                    <Money value={budget.spent_cents} />
                    <span>of {formatMoney(budget.limit_cents)}</span>
                  </p>
                  <ProgressBar
                    value={budget.progress_pct}
                    tone={over ? 'debit' : budget.progress_pct > 80 ? 'warn' : 'credit'}
                    label={`${budget.category_name} budget used`}
                  />
                  <p className="budget-card__meta">
                    {over ? (
                      <>Over by <Money value={Math.abs(budget.remaining_cents)} className="money--debit" /></>
                    ) : (
                      <><Money value={budget.remaining_cents} /> left</>
                    )}
                  </p>

                  <div className="budget-card__actions">
                    <Button variant="ghost" size="sm" onClick={() => setEditor({ budget })}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(budget)}>
                      Remove
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {editor ? (
        <BudgetEditor
          budget={editor.budget}
          month={month}
          categories={categories}
          budgets={budgets}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            notify(editor.budget ? 'Budget updated.' : 'Budget set.')
            reload()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove this budget?"
        body={`The ${pendingDelete?.category_name || ''} envelope will stop tracking. Existing entries stay in the ledger.`}
        confirmLabel="Remove"
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
