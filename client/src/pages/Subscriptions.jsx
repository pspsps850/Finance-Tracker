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
import { useToast } from '../components/Toast.jsx'
import { BILLING_CYCLES, CYCLE_LABELS, monthlyEquivalentCents } from '../lib/constants.js'
import { daysUntil, formatDate, relativeDays, todayKey } from '../lib/dates.js'
import { errorMessage, fieldErrors } from '../lib/errors.js'
import { centsToInput, parseMoney } from '../lib/money.js'
import { useResource } from '../lib/useResource.js'
import { hasErrors, validateSubscription } from '../lib/validation.js'

function SubscriptionEditor({ subscription, accounts, categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: subscription?.name ?? '',
    amount: subscription ? centsToInput(subscription.amount_cents) : '',
    billing_cycle: subscription?.billing_cycle ?? 'monthly',
    next_due_date: subscription?.next_due_date ?? todayKey(),
    account_id: subscription?.account_id ? String(subscription.account_id) : '',
    category_id: subscription?.category_id ? String(subscription.category_id) : '',
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event?.target ? event.target.value : event }))

  const submit = async (event) => {
    event.preventDefault()
    setFormError(null)
    const nextErrors = validateSubscription(form)
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return

    const payload = {
      name: form.name.trim(),
      amount_cents: parseMoney(form.amount),
      billing_cycle: form.billing_cycle,
      next_due_date: form.next_due_date,
      account_id: form.account_id ? Number(form.account_id) : null,
      category_id: form.category_id ? Number(form.category_id) : null,
    }

    setBusy(true)
    try {
      if (subscription) await api.subscriptions.update(subscription.id, payload)
      else await api.subscriptions.create(payload)
      onSaved()
    } catch (caught) {
      setErrors(fieldErrors(caught))
      setFormError(caught)
    } finally {
      setBusy(false)
    }
  }

  const categoryOptions = categories
    .filter((category) => ['needs', 'wants', 'savings'].includes(category.type))
    .map((category) => ({ value: category.id, label: category.name }))

  return (
    <Modal
      open
      onClose={onClose}
      title={subscription ? 'Edit subscription' : 'New subscription'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {subscription ? 'Save changes' : 'Track subscription'}
          </Button>
        </>
      }
    >
      <form className="form" onSubmit={submit} noValidate>
        <Field label="Name" htmlFor="sub-name" error={errors.name}>
          <Input
            id="sub-name"
            value={form.name}
            onChange={update('name')}
            placeholder="Netflix"
          />
        </Field>
        <div className="form-row">
          <Field label="Amount" htmlFor="sub-amount" error={errors.amount}>
            <MoneyInput id="sub-amount" value={form.amount} onChange={(value) => update('amount')(value)} />
          </Field>
          <Field label="Billing cycle" htmlFor="sub-cycle" error={errors.billing_cycle}>
            <Select
              id="sub-cycle"
              value={form.billing_cycle}
              onChange={update('billing_cycle')}
              options={BILLING_CYCLES}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Next due" htmlFor="sub-due" error={errors.next_due_date}>
            <Input
              id="sub-due"
              type="date"
              value={form.next_due_date}
              onChange={update('next_due_date')}
            />
          </Field>
          <Field label="Paid from" htmlFor="sub-account">
            <Select
              id="sub-account"
              value={form.account_id}
              onChange={update('account_id')}
              options={accounts.map((account) => ({ value: account.id, label: account.name }))}
              placeholder="No account"
            />
          </Field>
        </div>
        <Field label="Category" htmlFor="sub-category" hint="Where renewals land in spending reports.">
          <Select
            id="sub-category"
            value={form.category_id}
            onChange={update('category_id')}
            options={categoryOptions}
            placeholder="Uncategorized"
          />
        </Field>
        <FormError>{formError ? errorMessage(formError) : null}</FormError>
      </form>
    </Modal>
  )
}

export function Subscriptions() {
  const notify = useToast()
  const { data, loading, error, reload } = useResource(async () => {
    const [subscriptions, accounts, categories] = await Promise.all([
      api.subscriptions.list(),
      api.accounts.list(),
      api.categories.list(),
    ])
    return { subscriptions, accounts, categories }
  }, [])
  const [editor, setEditor] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const toggleActive = async (subscription) => {
    try {
      await api.subscriptions.update(subscription.id, { is_active: subscription.is_active ? 0 : 1 })
      notify(subscription.is_active ? 'Subscription paused.' : 'Subscription resumed.')
      reload()
    } catch (caught) {
      notify(errorMessage(caught), 'error')
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.subscriptions.remove(pendingDelete.id)
      notify('Subscription removed.')
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
        <PageHeader eyebrow="Planning" title="Subscriptions" />
        <LoadingPage label="Loading subscriptions" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <PageHeader eyebrow="Planning" title="Subscriptions" />
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  const { subscriptions, accounts, categories } = data
  const active = subscriptions.filter((subscription) => subscription.is_active)
  const paused = subscriptions.filter((subscription) => !subscription.is_active)
  const monthlyTotal = active.reduce(
    (total, subscription) => total + monthlyEquivalentCents(subscription.amount_cents, subscription.billing_cycle),
    0,
  )

  const renderRow = (subscription) => {
    const countdown = daysUntil(subscription.next_due_date)
    const overdue = countdown !== null && countdown < 0
    const account = accounts.find((item) => item.id === subscription.account_id)
    const category = categories.find((item) => item.id === subscription.category_id)
    return (
      <li key={subscription.id} className={`sub-row ${subscription.is_active ? '' : 'is-paused'}`.trim()}>
        <div className="sub-row__main">
          <h3>{subscription.name}</h3>
          <p>
            {CYCLE_LABELS[subscription.billing_cycle] || subscription.billing_cycle}
            {category ? ` · ${category.name}` : ''}
            {account ? ` · ${account.name}` : ''}
          </p>
        </div>
        <div className="sub-row__amount">
          <Money value={subscription.amount_cents} />
          <small>≈ {CYCLE_LABELS[subscription.billing_cycle]?.toLowerCase()}</small>
        </div>
        <div className="sub-row__due">
          <span className={`badge ${overdue ? 'badge--debit' : countdown !== null && countdown <= 7 ? 'badge--stamp' : ''}`.trim()}>
            {relativeDays(subscription.next_due_date)}
          </span>
          <small>{formatDate(subscription.next_due_date)}</small>
        </div>
        <div className="sub-row__actions">
          <button type="button" className="row-action" onClick={() => setEditor({ subscription })}>
            Edit
          </button>
          <button type="button" className="row-action" onClick={() => toggleActive(subscription)}>
            {subscription.is_active ? 'Pause' : 'Resume'}
          </button>
          <button
            type="button"
            className="row-action row-action--danger"
            onClick={() => setPendingDelete(subscription)}
          >
            Delete
          </button>
        </div>
      </li>
    )
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Planning"
        title="Subscriptions"
        description="The small recurring charges that quietly add up."
        actions={<Button onClick={() => setEditor({ subscription: null })}>New subscription</Button>}
      />

      <div className="sub-summary">
        <div>
          <p className="stat-label">Monthly equivalent</p>
          <p className="stat-value stat-value--lg">
            <Money value={monthlyTotal} />
          </p>
        </div>
        <div>
          <p className="stat-label">Active</p>
          <p className="stat-value stat-value--lg mono">{active.length}</p>
        </div>
      </div>

      {subscriptions.length === 0 ? (
        <Card>
          <EmptyState
            icon="repeat"
            title="No subscriptions tracked"
            description="Streaming, storage, the gym — list the recurring charges so the next renewal is not a surprise."
            action={<Button onClick={() => setEditor({ subscription: null })}>New subscription</Button>}
          />
        </Card>
      ) : (
        <>
          <Card className="sub-card">
            <ul className="sub-list">{active.map(renderRow)}</ul>
          </Card>
          {paused.length ? (
            <>
              <h2 className="section-title section-title--spaced">Paused</h2>
              <Card className="sub-card">
                <ul className="sub-list">{paused.map(renderRow)}</ul>
              </Card>
            </>
          ) : null}
        </>
      )}

      {editor ? (
        <SubscriptionEditor
          subscription={editor.subscription}
          accounts={accounts}
          categories={categories}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            notify(editor.subscription ? 'Subscription updated.' : 'Subscription added.')
            reload()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this subscription?"
        body={`${pendingDelete?.name || 'The subscription'} will stop appearing in renewals. Past transactions are untouched.`}
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
