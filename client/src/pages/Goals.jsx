import { useState } from 'react'
import { api } from '../api.js'
import { Button } from '../components/Button.jsx'
import { Card } from '../components/Card.jsx'
import { ConfirmDialog } from '../components/ConfirmDialog.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorState } from '../components/ErrorState.jsx'
import { Field, FormError, Input, MoneyInput, Select, Textarea } from '../components/Form.jsx'
import { LoadingPage } from '../components/Loading.jsx'
import { Modal } from '../components/Modal.jsx'
import { Money } from '../components/Money.jsx'
import { PageHeader } from '../components/PageHeader.jsx'
import { ProgressBar } from '../components/ProgressBar.jsx'
import { useToast } from '../components/Toast.jsx'
import { GOAL_STATUSES } from '../lib/constants.js'
import { formatDate, relativeDays, todayKey } from '../lib/dates.js'
import { errorMessage, fieldErrors } from '../lib/errors.js'
import { centsToInput, formatMoney, parseMoney } from '../lib/money.js'
import { useResource } from '../lib/useResource.js'
import { hasErrors, validateGoal } from '../lib/validation.js'

function GoalEditor({ goal, accounts, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: goal?.name ?? '',
    target: goal ? centsToInput(goal.target_cents) : '',
    target_date: goal?.target_date ?? '',
    linked_account_id: goal?.linked_account_id ? String(goal.linked_account_id) : '',
    status: goal?.status ?? 'active',
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event?.target ? event.target.value : event }))

  const submit = async (event) => {
    event.preventDefault()
    setFormError(null)
    const nextErrors = validateGoal(form)
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return

    const payload = {
      name: form.name.trim(),
      target_cents: parseMoney(form.target),
      target_date: form.target_date || null,
      linked_account_id: form.linked_account_id ? Number(form.linked_account_id) : null,
      status: form.status,
    }

    setBusy(true)
    try {
      if (goal) await api.goals.update(goal.id, payload)
      else await api.goals.create(payload)
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
      title={goal ? 'Edit goal' : 'New goal'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {goal ? 'Save changes' : 'Create goal'}
          </Button>
        </>
      }
    >
      <form className="form" onSubmit={submit} noValidate>
        <Field label="Name" htmlFor="goal-name" error={errors.name}>
          <Input
            id="goal-name"
            value={form.name}
            onChange={update('name')}
            placeholder="Emergency fund"
          />
        </Field>
        <div className="form-row">
          <Field label="Target amount" htmlFor="goal-target" error={errors.target}>
            <MoneyInput id="goal-target" value={form.target} onChange={(value) => update('target')(value)} />
          </Field>
          <Field label="Target date" htmlFor="goal-date" hint="Optional.">
            <Input
              id="goal-date"
              type="date"
              value={form.target_date}
              onChange={update('target_date')}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Linked account" htmlFor="goal-account" hint="Where the money is being kept.">
            <Select
              id="goal-account"
              value={form.linked_account_id}
              onChange={update('linked_account_id')}
              options={accounts.map((account) => ({ value: account.id, label: account.name }))}
              placeholder="No account"
            />
          </Field>
          {goal ? (
            <Field label="Status" htmlFor="goal-status">
              <Select id="goal-status" value={form.status} onChange={update('status')} options={GOAL_STATUSES} />
            </Field>
          ) : null}
        </div>
        <FormError>{formError ? errorMessage(formError) : null}</FormError>
      </form>
    </Modal>
  )
}

function AllocationEditor({ goal, accounts, onClose, onSaved }) {
  const [form, setForm] = useState({
    account_id: goal.linked_account_id ? String(goal.linked_account_id) : '',
    amount: '',
    allocated_at: todayKey(),
    note: '',
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setFormError(null)
    const nextErrors = {}
    if (!form.account_id) nextErrors.account_id = 'Choose where the money came from.'
    if (parseMoney(form.amount) === null || parseMoney(form.amount) <= 0) {
      nextErrors.amount = 'Enter an amount greater than zero.'
    }
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return

    setBusy(true)
    try {
      await api.goals.allocate(goal.id, {
        account_id: Number(form.account_id),
        amount_cents: parseMoney(form.amount),
        allocated_at: `${form.allocated_at}T12:00:00+08:00`,
        note: form.note.trim(),
      })
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
      title={`Add to ${goal.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Allocate
          </Button>
        </>
      }
    >
      <form className="form" onSubmit={submit} noValidate>
        <div className="form-row">
          <Field label="From account" htmlFor="allocation-account" error={errors.account_id}>
            <Select
              id="allocation-account"
              value={form.account_id}
              onChange={(event) => setForm({ ...form, account_id: event.target.value })}
              options={accounts.map((account) => ({ value: account.id, label: account.name }))}
              placeholder="Choose an account"
            />
          </Field>
          <Field label="Amount" htmlFor="allocation-amount" error={errors.amount}>
            <MoneyInput
              id="allocation-amount"
              value={form.amount}
              onChange={(value) => setForm({ ...form, amount: value })}
            />
          </Field>
        </div>
        <Field label="Date" htmlFor="allocation-date">
          <Input
            id="allocation-date"
            type="date"
            value={form.allocated_at}
            onChange={(event) => setForm({ ...form, allocated_at: event.target.value })}
          />
        </Field>
        <Field label="Note" htmlFor="allocation-note" hint="Optional.">
          <Textarea
            id="allocation-note"
            rows={2}
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            placeholder="Monthly top-up"
          />
        </Field>
        <p className="form-note">
          Allocations earmark money — they do not move funds between accounts.
        </p>
        <FormError>{formError ? errorMessage(formError) : null}</FormError>
      </form>
    </Modal>
  )
}

export function Goals() {
  const notify = useToast()
  const { data, loading, error, reload } = useResource(async () => {
    const [goals, accounts] = await Promise.all([api.goals.list(), api.accounts.list()])
    return { goals, accounts }
  }, [])
  const [editor, setEditor] = useState(null)
  const [allocating, setAllocating] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.goals.remove(pendingDelete.id)
      notify('Goal deleted.')
      setPendingDelete(null)
      reload()
    } catch (caught) {
      setPendingDelete(null)
      notify(errorMessage(caught), 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="page">
        <PageHeader eyebrow="Planning" title="Goals" />
        <LoadingPage label="Loading goals" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <PageHeader eyebrow="Planning" title="Goals" />
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  const { goals, accounts } = data
  const active = goals.filter((goal) => goal.status === 'active')
  const archived = goals.filter((goal) => goal.status !== 'active')

  const renderGoal = (goal) => {
    const percent = goal.progress_pct ?? 0
    const achieved = goal.status === 'achieved' || (goal.target_cents && goal.allocated_cents >= goal.target_cents)
    return (
      <Card key={goal.id} className={`goal-card ${achieved ? 'is-achieved' : ''}`.trim()}>
        <div className="goal-card__head">
          <div>
            <h2>{goal.name}</h2>
            <p className="goal-card__meta">
              {goal.linked_account_name ? `${goal.linked_account_name} · ` : ''}
              {goal.target_date ? `due ${formatDate(goal.target_date)}` : 'no target date'}
            </p>
          </div>
          <span className={`badge ${goal.status === 'achieved' ? 'badge--credit' : ''}`.trim()}>
            {goal.status}
          </span>
        </div>

        <p className="goal-card__numbers">
          <Money value={goal.allocated_cents} />
          <span>of {formatMoney(goal.target_cents)}</span>
        </p>
        <ProgressBar value={percent} tone={achieved ? 'credit' : 'stamp'} label={`${goal.name} progress`} />
        <div className="goal-card__foot">
          <span className="mono">{percent}%</span>
          {goal.target_date ? <span>{relativeDays(goal.target_date)}</span> : <span />}
        </div>

        <div className="goal-card__actions">
          <Button size="sm" variant="secondary" onClick={() => setAllocating(goal)}>
            Allocate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditor({ goal })}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(goal)}>
            Delete
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Planning"
        title="Goals"
        description="Earmark money for the things that are not bills."
        actions={<Button onClick={() => setEditor({ goal: null })}>New goal</Button>}
      />

      {goals.length === 0 ? (
        <Card>
          <EmptyState
            icon="target"
            title="No goals yet"
            description="An emergency fund is the usual first one. Name it, set a target, then chip away."
            action={<Button onClick={() => setEditor({ goal: null })}>New goal</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="goal-grid">{active.map(renderGoal)}</div>
          {archived.length ? (
            <>
              <h2 className="section-title section-title--spaced">Archived and achieved</h2>
              <div className="goal-grid">{archived.map(renderGoal)}</div>
            </>
          ) : null}
        </>
      )}

      {editor ? (
        <GoalEditor
          goal={editor.goal}
          accounts={accounts}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            notify(editor.goal ? 'Goal updated.' : 'Goal created.')
            reload()
          }}
        />
      ) : null}

      {allocating ? (
        <AllocationEditor
          goal={allocating}
          accounts={accounts}
          onClose={() => setAllocating(null)}
          onSaved={() => {
            setAllocating(null)
            notify('Allocation added.')
            reload()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this goal?"
        body={`${pendingDelete?.name || 'The goal'} and its allocations will be removed. The account balances do not change.`}
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
