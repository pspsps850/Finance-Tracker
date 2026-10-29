import { useState } from 'react'
import { api } from '../api.js'
import { Button } from '../components/Button.jsx'
import { Card } from '../components/Card.jsx'
import { ConfirmDialog } from '../components/ConfirmDialog.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorState } from '../components/ErrorState.jsx'
import { Field, FormError, Input, MoneyInput, Segmented, Select, Textarea } from '../components/Form.jsx'
import { Modal } from '../components/Modal.jsx'
import { Money } from '../components/Money.jsx'
import { PageHeader } from '../components/PageHeader.jsx'
import { SkeletonStack } from '../components/Loading.jsx'
import { useToast } from '../components/Toast.jsx'
import {
  currentMonthKey,
  dateKeyInTz,
  formatDate,
  fromManilaDatetimeInput,
  monthRange,
  toManilaDatetimeInput,
  todayKey,
} from '../lib/dates.js'
import { errorMessage, fieldErrors } from '../lib/errors.js'
import { parseMoney } from '../lib/money.js'
import { useResource } from '../lib/useResource.js'
import { EXPENSE_CATEGORY_TYPES } from '../lib/constants.js'
import { hasErrors, validateTransaction } from '../lib/validation.js'

const PAGE_SIZE = 20

const KIND_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
]

function initialFilters() {
  const range = monthRange(currentMonthKey())
  return { from: range.start, to: todayKey(), account_id: '', category_id: '', q: '' }
}

function categoryOptions(categories, kind) {
  const allowed = kind === 'income' ? ['income'] : EXPENSE_CATEGORY_TYPES
  return categories
    .filter((category) => allowed.includes(category.type))
    .map((category) => ({ value: category.id, label: category.name }))
}

function TransactionEditor({ transaction, accounts, categories, onClose, onSaved }) {
  const editing = Boolean(transaction)
  const [kind, setKind] = useState(
    transaction ? (transaction.amount_cents < 0 ? 'expense' : 'income') : 'expense',
  )
  const [form, setForm] = useState({
    account_id: transaction ? String(transaction.account_id) : '',
    to_account_id: '',
    category_id: transaction?.category_id ? String(transaction.category_id) : '',
    amount: transaction ? (Math.abs(transaction.amount_cents) / 100).toFixed(2) : '',
    occurred_at: toManilaDatetimeInput(transaction?.occurred_at ?? new Date()),
    description: transaction?.description ?? '',
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event?.target ? event.target.value : event }))

  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: `${account.name}${account.is_active ? '' : ' (archived)'}`,
  }))

  const submit = async (event) => {
    event.preventDefault()
    setFormError(null)
    const nextErrors = validateTransaction({ ...form, kind })
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return

    const cents = Math.abs(parseMoney(form.amount))
    const base = {
      occurred_at: fromManilaDatetimeInput(form.occurred_at),
      description: form.description.trim(),
    }

    setBusy(true)
    try {
      if (kind === 'transfer') {
        await api.transactions.transfer({
          ...base,
          from_account_id: Number(form.account_id),
          to_account_id: Number(form.to_account_id),
          amount_cents: cents,
        })
      } else if (editing) {
        await api.transactions.update(transaction.id, {
          ...base,
          account_id: Number(form.account_id),
          category_id: form.category_id ? Number(form.category_id) : null,
          amount_cents: kind === 'expense' ? -cents : cents,
        })
      } else {
        await api.transactions.create({
          ...base,
          account_id: Number(form.account_id),
          category_id: form.category_id ? Number(form.category_id) : null,
          amount_cents: kind === 'expense' ? -cents : cents,
        })
      }
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
      title={editing ? 'Edit entry' : 'New entry'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {editing ? 'Save changes' : 'Record entry'}
          </Button>
        </>
      }
    >
      <form className="form" onSubmit={submit} noValidate>
        {!editing ? (
          <Segmented
            label="Entry type"
            options={KIND_OPTIONS}
            value={kind}
            onChange={(value) => {
              setKind(value)
              setForm((current) => ({ ...current, category_id: '', to_account_id: '' }))
              setErrors({})
            }}
          />
        ) : null}

        <div className="form-row">
          <Field
            label={kind === 'transfer' ? 'From account' : 'Account'}
            htmlFor="tx-account"
            error={errors.account_id}
          >
            <Select
              id="tx-account"
              value={form.account_id}
              onChange={update('account_id')}
              options={accountOptions}
              placeholder="Choose an account"
            />
          </Field>

          {kind === 'transfer' ? (
            <Field label="To account" htmlFor="tx-to-account" error={errors.to_account_id}>
              <Select
                id="tx-to-account"
                value={form.to_account_id}
                onChange={update('to_account_id')}
                options={accountOptions.filter((option) => String(option.value) !== String(form.account_id))}
                placeholder="Choose the destination"
              />
            </Field>
          ) : (
            <Field label="Category" htmlFor="tx-category" error={errors.category_id} hint="Optional, but budgets need it.">
              <Select
                id="tx-category"
                value={form.category_id}
                onChange={update('category_id')}
                options={categoryOptions(categories, kind)}
                placeholder="Uncategorized"
              />
            </Field>
          )}
        </div>

        <div className="form-row">
          <Field label="Amount" htmlFor="tx-amount" error={errors.amount}>
            <MoneyInput id="tx-amount" value={form.amount} onChange={(value) => update('amount')(value)} />
          </Field>
          <Field label="When" htmlFor="tx-date" error={errors.occurred_at}>
            <Input
              id="tx-date"
              type="datetime-local"
              value={form.occurred_at}
              onChange={update('occurred_at')}
            />
          </Field>
        </div>

        <Field label="Description" htmlFor="tx-description">
          <Textarea
            id="tx-description"
            rows={2}
            value={form.description}
            onChange={update('description')}
            placeholder={kind === 'transfer' ? 'Moving money between accounts' : 'What was this for?'}
          />
        </Field>

        {kind === 'transfer' ? (
          <p className="form-note">
            Transfers create two linked entries — money out of one account, into the other — and never count as spending.
          </p>
        ) : null}

        <FormError>{formError ? errorMessage(formError) : null}</FormError>
      </form>
    </Modal>
  )
}

export function Transactions() {
  const notify = useToast()
  const [draft, setDraft] = useState(initialFilters)
  const [query, setQuery] = useState({ ...initialFilters(), page: 1 })
  const [editor, setEditor] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const { data, loading, error, reload } = useResource(async () => {
    const [list, accounts, categories] = await Promise.all([
      api.transactions.list({ ...query, page_size: PAGE_SIZE }),
      api.accounts.list(),
      api.categories.list(),
    ])
    return { list, accounts, categories }
  }, [query])

  const applyFilters = (event) => {
    event.preventDefault()
    setQuery({ ...draft, page: 1 })
  }

  const resetFilters = () => {
    const blank = initialFilters()
    setDraft(blank)
    setQuery({ ...blank, page: 1 })
  }

  const goToPage = (page) => setQuery((current) => ({ ...current, page }))

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.transactions.remove(pendingDelete.id)
      notify('Entry deleted.')
      setPendingDelete(null)
      reload()
    } catch (caught) {
      setPendingDelete(null)
      notify(errorMessage(caught), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const list = data?.list
  const accounts = data?.accounts ?? []
  const categories = data?.categories ?? []
  const accountName = (transaction) =>
    transaction.account_name ??
    accounts.find((account) => account.id === transaction.account_id)?.name ??
    'Unknown account'
  const categoryName = (transaction) =>
    transaction.category_name ??
    categories.find((category) => category.id === transaction.category_id)?.name ??
    'Uncategorized'

  const pageCount = list ? Math.max(1, Math.ceil(list.total / (list.page_size || PAGE_SIZE))) : 1

  return (
    <div className="page">
      <PageHeader
        eyebrow="Ledger"
        title="Transactions"
        description="Every entry, newest first. Transfers stay out of the spending math."
        actions={<Button onClick={() => setEditor({ transaction: null })}>New entry</Button>}
      />

      <Card className="filter-card">
        <form className="filter-bar" onSubmit={applyFilters}>
          <Field label="From" htmlFor="filter-from">
            <Input
              id="filter-from"
              type="date"
              value={draft.from}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
          </Field>
          <Field label="To" htmlFor="filter-to">
            <Input
              id="filter-to"
              type="date"
              value={draft.to}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </Field>
          <Field label="Account" htmlFor="filter-account">
            <Select
              id="filter-account"
              value={draft.account_id}
              onChange={(event) => setDraft({ ...draft, account_id: event.target.value })}
              options={accounts.map((account) => ({ value: account.id, label: account.name }))}
              placeholder="All accounts"
            />
          </Field>
          <Field label="Category" htmlFor="filter-category">
            <Select
              id="filter-category"
              value={draft.category_id}
              onChange={(event) => setDraft({ ...draft, category_id: event.target.value })}
              options={categories.map((category) => ({ value: category.id, label: category.name }))}
              placeholder="All categories"
            />
          </Field>
          <Field label="Search" htmlFor="filter-search" className="filter-bar__search">
            <Input
              id="filter-search"
              type="search"
              value={draft.q}
              onChange={(event) => setDraft({ ...draft, q: event.target.value })}
              placeholder="Description, account, category"
            />
          </Field>
          <div className="filter-bar__actions">
            <Button type="submit" size="sm">
              Apply
            </Button>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </form>
      </Card>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <Card>
          <SkeletonStack rows={7} />
        </Card>
      ) : list && list.items.length === 0 ? (
        <Card>
          <EmptyState
            icon="transactions"
            title="No entries match"
            description="Clear the filters, widen the dates, or record something new."
            action={<Button onClick={() => setEditor({ transaction: null })}>New entry</Button>}
          />
        </Card>
      ) : (
        <Card className="table-card">
          <div className="table-meta">
            <p>
              <strong>{list.total}</strong> {list.total === 1 ? 'entry' : 'entries'}
            </p>
            <p className="mono">
              Page {list.page} of {pageCount}
            </p>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  <th scope="col">Account</th>
                  <th scope="col">Category</th>
                  <th scope="col" className="table__num">
                    Amount
                  </th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((transaction) => {
                  const isTransfer = Boolean(transaction.transfer_group_id)
                  return (
                    <tr key={transaction.id}>
                      <td className="mono table__date">
                        {formatDate(dateKeyInTz(new Date(transaction.occurred_at)))}
                      </td>
                      <td>
                        <span className="table__desc">{transaction.description || 'No description'}</span>
                        {isTransfer ? <span className="badge badge--stamp">Transfer</span> : null}
                      </td>
                      <td>{accountName(transaction)}</td>
                      <td>{categoryName(transaction)}</td>
                      <td className="table__num">
                        <Money value={transaction.amount_cents} signed />
                      </td>
                      <td className="table__actions">
                        <button
                          type="button"
                          className="row-action"
                          onClick={() => {
                            if (isTransfer) {
                              notify('Transfers can only be deleted, not edited.', 'error')
                              return
                            }
                            setEditor({ transaction })
                          }}
                          aria-label={`Edit ${transaction.description || 'entry'}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="row-action row-action--danger"
                          onClick={() => setPendingDelete(transaction)}
                          aria-label={`Delete ${transaction.description || 'entry'}`}
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

          <div className="pager">
            <Button
              variant="secondary"
              size="sm"
              disabled={list.page <= 1}
              onClick={() => goToPage(list.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={list.page >= pageCount}
              onClick={() => goToPage(list.page + 1)}
            >
              Next
            </Button>
          </div>
        </Card>
      )}

      {editor ? (
        <TransactionEditor
          transaction={editor.transaction}
          accounts={accounts}
          categories={categories}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            notify(editor.transaction ? 'Entry updated.' : 'Entry recorded.')
            reload()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete?.transfer_group_id ? 'Delete this transfer?' : 'Delete this entry?'}
        body={
          pendingDelete?.transfer_group_id
            ? 'Both sides of the transfer will be removed from the ledger.'
            : 'The entry will be removed from balances and budgets. This cannot be undone from here.'
        }
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
