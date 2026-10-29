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
import { centsToInput, parseMoney, percentOf } from '../lib/money.js'
import { errorMessage, fieldErrors } from '../lib/errors.js'
import { useResource } from '../lib/useResource.js'
import { hasErrors, validateDebt } from '../lib/validation.js'

function DebtEditor({ debt, accounts, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: debt?.name ?? '',
    account_id: debt?.account_id ? String(debt.account_id) : '',
    principal: debt ? centsToInput(debt.principal_cents) : '',
    current_balance: debt ? centsToInput(debt.current_balance_cents) : '',
    rate: debt ? (debt.interest_rate_bps / 100).toString() : '',
    minimum_payment: debt ? centsToInput(debt.minimum_payment_cents) : '',
    due_day: debt?.due_day ? String(debt.due_day) : '',
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event?.target ? event.target.value : event }))

  const submit = async (event) => {
    event.preventDefault()
    setFormError(null)
    const nextErrors = validateDebt(form)
    if (form.rate !== '' && Number.isNaN(Number(form.rate))) {
      nextErrors.rate = 'Enter a rate like 6.5.'
    }
    if (form.due_day !== '' && (Number(form.due_day) < 1 || Number(form.due_day) > 31)) {
      nextErrors.due_day = 'Use a day between 1 and 31.'
    }
    if (form.minimum_payment && parseMoney(form.minimum_payment) === null) {
      nextErrors.minimum_payment = 'Enter a valid amount.'
    }
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return

    const payload = {
      name: form.name.trim(),
      account_id: form.account_id ? Number(form.account_id) : null,
      principal_cents: parseMoney(form.principal),
      current_balance_cents: parseMoney(form.current_balance),
      interest_rate_bps: form.rate === '' ? 0 : Math.round(Number(form.rate) * 100),
      minimum_payment_cents: form.minimum_payment ? parseMoney(form.minimum_payment) : 0,
      due_day: form.due_day === '' ? null : Number(form.due_day),
    }

    setBusy(true)
    try {
      if (debt) await api.debts.update(debt.id, payload)
      else await api.debts.create(payload)
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
      wide
      title={debt ? 'Edit debt' : 'New debt'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {debt ? 'Save changes' : 'Track debt'}
          </Button>
        </>
      }
    >
      <form className="form" onSubmit={submit} noValidate>
        <div className="form-row">
          <Field label="Name" htmlFor="debt-name" error={errors.name}>
            <Input
              id="debt-name"
              value={form.name}
              onChange={update('name')}
              placeholder="Car loan"
            />
          </Field>
          <Field label="Linked account" htmlFor="debt-account" hint="Optional.">
            <Select
              id="debt-account"
              value={form.account_id}
              onChange={update('account_id')}
              options={accounts.map((account) => ({ value: account.id, label: account.name }))}
              placeholder="No account"
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Original amount" htmlFor="debt-principal" error={errors.principal}>
            <MoneyInput id="debt-principal" value={form.principal} onChange={(value) => update('principal')(value)} />
          </Field>
          <Field label="Current balance" htmlFor="debt-current" error={errors.current_balance}>
            <MoneyInput
              id="debt-current"
              value={form.current_balance}
              onChange={(value) => update('current_balance')(value)}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Interest rate %" htmlFor="debt-rate" error={errors.rate} hint="Annual, e.g. 6.5.">
            <Input
              id="debt-rate"
              inputMode="decimal"
              value={form.rate}
              onChange={update('rate')}
              placeholder="0"
            />
          </Field>
          <Field label="Minimum payment" htmlFor="debt-minimum" error={errors.minimum_payment}>
            <MoneyInput
              id="debt-minimum"
              value={form.minimum_payment}
              onChange={(value) => update('minimum_payment')(value)}
            />
          </Field>
        </div>
        <Field label="Due day" htmlFor="debt-due" error={errors.due_day} hint="Day of the month, 1–31.">
          <Input
            id="debt-due"
            type="number"
            min="1"
            max="31"
            value={form.due_day}
            onChange={update('due_day')}
            placeholder="10"
          />
        </Field>
        <FormError>{formError ? errorMessage(formError) : null}</FormError>
      </form>
    </Modal>
  )
}

export function Debts() {
  const notify = useToast()
  const { data, loading, error, reload } = useResource(async () => {
    const [debts, accounts] = await Promise.all([api.debts.list(), api.accounts.list()])
    return { debts, accounts }
  }, [])
  const [editor, setEditor] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.debts.remove(pendingDelete.id)
      notify('Debt removed.')
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
        <PageHeader eyebrow="Planning" title="Debts" />
        <LoadingPage label="Loading debts" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <PageHeader eyebrow="Planning" title="Debts" />
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  const { debts, accounts } = data
  const totalOwed = debts.reduce((total, debt) => total + debt.current_balance_cents, 0)
  const totalMinimum = debts.reduce((total, debt) => total + debt.minimum_payment_cents, 0)

  return (
    <div className="page">
      <PageHeader
        eyebrow="Planning"
        title="Debts"
        description="What is owed, what it costs, and when the next payment lands."
        actions={<Button onClick={() => setEditor({ debt: null })}>New debt</Button>}
      />

      <div className="debt-summary">
        <div>
          <p className="stat-label">Outstanding</p>
          <p className="stat-value stat-value--lg">
            <Money value={totalOwed} />
          </p>
        </div>
        <div>
          <p className="stat-label">Minimums per month</p>
          <p className="stat-value stat-value--lg">
            <Money value={totalMinimum} />
          </p>
        </div>
      </div>

      {debts.length === 0 ? (
        <Card>
          <EmptyState
            icon="card"
            title="No debts tracked"
            description="Add a loan or card balance to see how much of each payment goes to principal."
            action={<Button onClick={() => setEditor({ debt: null })}>New debt</Button>}
          />
        </Card>
      ) : (
        <Card className="table-card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Debt</th>
                  <th scope="col">Account</th>
                  <th scope="col" className="table__num">Principal</th>
                  <th scope="col" className="table__num">Balance</th>
                  <th scope="col">Progress</th>
                  <th scope="col" className="table__num">Rate</th>
                  <th scope="col" className="table__num">Minimum</th>
                  <th scope="col">Due</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {debts.map((debt) => {
                  const paid = Math.max(0, debt.principal_cents - debt.current_balance_cents)
                  const paidPercent = percentOf(paid, debt.principal_cents)
                  const account = accounts.find((item) => item.id === debt.account_id)
                  return (
                    <tr key={debt.id}>
                      <td className="table__desc">{debt.name}</td>
                      <td>{account?.name || '—'}</td>
                      <td className="table__num"><Money value={debt.principal_cents} /></td>
                      <td className="table__num"><Money value={debt.current_balance_cents} /></td>
                      <td className="debt-progress">
                        <ProgressBar value={paidPercent} label={`${debt.name} paid off`} />
                        <span className="mono">{paidPercent}%</span>
                      </td>
                      <td className="table__num mono">{(debt.interest_rate_bps / 100).toFixed(2)}%</td>
                      <td className="table__num"><Money value={debt.minimum_payment_cents} /></td>
                      <td className="mono">{debt.due_day ? `Day ${debt.due_day}` : '—'}</td>
                      <td className="table__actions">
                        <button type="button" className="row-action" onClick={() => setEditor({ debt })}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="row-action row-action--danger"
                          onClick={() => setPendingDelete(debt)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="table-foot">
            Balances are updated by hand. Payments recorded as transactions do not change this number automatically.
          </p>
        </Card>
      )}

      {editor ? (
        <DebtEditor
          debt={editor.debt}
          accounts={accounts}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            notify(editor.debt ? 'Debt updated.' : 'Debt added.')
            reload()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this debt?"
        body={`${pendingDelete?.name || 'The debt'} stops being tracked. The account balance it points at is unchanged.`}
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
