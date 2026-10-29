import { useState } from 'react'
import { api, isMock, resetDemoData } from '../api.js'
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
import { ACCOUNT_SUBTYPES, ACCOUNT_TYPES, SUBTYPE_LABELS } from '../lib/constants.js'
import { centsToInput, parseMoney } from '../lib/money.js'
import { errorMessage, fieldErrors } from '../lib/errors.js'
import { useResource } from '../lib/useResource.js'
import { hasErrors, validateAccount } from '../lib/validation.js'

function AccountEditor({ account, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: account?.name ?? '',
    type: account?.type ?? 'asset',
    subtype: account?.subtype ?? 'bank',
    opening_balance: centsToInput(account?.opening_balance_cents ?? 0),
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const update = (key) => (event) => {
    const value = event?.target ? event.target.value : event
    setForm((current) => {
      if (key === 'type') {
        return { ...current, type: value, subtype: ACCOUNT_SUBTYPES[value][0].value }
      }
      return { ...current, [key]: value }
    })
  }

  const submit = async (event) => {
    event.preventDefault()
    setFormError(null)
    const nextErrors = validateAccount(form)
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return

    const payload = {
      name: form.name.trim(),
      type: form.type,
      subtype: form.subtype,
      opening_balance_cents: parseMoney(form.opening_balance),
    }

    setBusy(true)
    try {
      if (account) await api.accounts.update(account.id, payload)
      else await api.accounts.create(payload)
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
      title={account ? 'Edit account' : 'New account'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {account ? 'Save changes' : 'Create account'}
          </Button>
        </>
      }
    >
      <form className="form" onSubmit={submit} noValidate>
        <Field label="Name" htmlFor="account-name" error={errors.name}>
          <Input
            id="account-name"
            value={form.name}
            onChange={update('name')}
            placeholder="BPI Savings"
          />
        </Field>
        <div className="form-row">
          <Field label="Type" htmlFor="account-type" error={errors.type}>
            <Select
              id="account-type"
              value={form.type}
              onChange={update('type')}
              options={ACCOUNT_TYPES}
            />
          </Field>
          <Field label="Subtype" htmlFor="account-subtype" error={errors.subtype}>
            <Select
              id="account-subtype"
              value={form.subtype}
              onChange={update('subtype')}
              options={ACCOUNT_SUBTYPES[form.type]}
            />
          </Field>
        </div>
        <Field
          label={form.type === 'liability' ? 'Opening balance owed' : 'Opening balance'}
          htmlFor="account-opening"
          error={errors.opening_balance}
          hint="Amount already in the account before you started tracking. Currency is PHP."
        >
          <MoneyInput
            id="account-opening"
            value={form.opening_balance}
            onChange={update('opening_balance')}
          />
        </Field>
        <FormError>{formError ? errorMessage(formError) : null}</FormError>
      </form>
    </Modal>
  )
}

export function Accounts() {
  const notify = useToast()
  const { data, loading, error, reload } = useResource(() => api.accounts.list(), [])
  const [editor, setEditor] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [resetting, setResetting] = useState(false)

  const toggleActive = async (account) => {
    try {
      await api.accounts.update(account.id, { is_active: account.is_active ? 0 : 1 })
      notify(account.is_active ? 'Account archived.' : 'Account restored.')
      reload()
    } catch (caught) {
      notify(errorMessage(caught), 'error')
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.accounts.remove(pendingDelete.id)
      notify('Account deleted.')
      setPendingDelete(null)
      reload()
    } catch (caught) {
      setPendingDelete(null)
      notify(errorMessage(caught), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const resetDemo = async () => {
    setResetting(true)
    await resetDemoData()
    window.location.assign('/login')
  }

  if (loading && !data) {
    return (
      <div className="page">
        <PageHeader eyebrow="Ledger" title="Accounts" />
        <LoadingPage label="Loading accounts" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <PageHeader eyebrow="Ledger" title="Accounts" />
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  const assets = data.filter((account) => account.type === 'asset')
  const liabilities = data.filter((account) => account.type === 'liability')
  const totalAssets = assets.reduce((total, account) => total + account.balance_cents, 0)
  const totalOwed = liabilities.reduce((total, account) => total + account.balance_cents, 0)

  return (
    <div className="page">
      <PageHeader
        eyebrow="Ledger"
        title="Accounts"
        description="Where the money sits, and what is still owed."
        actions={
          <>
            {isMock ? (
              <Button variant="ghost" onClick={resetDemo} loading={resetting}>
                Reset demo data
              </Button>
            ) : null}
            <Button onClick={() => setEditor({ account: null })}>New account</Button>
          </>
        }
      />

      <div className="account-totals">
        <div>
          <p className="stat-label">Total assets</p>
          <p className="stat-value stat-value--lg">
            <Money value={totalAssets} />
          </p>
        </div>
        <div>
          <p className="stat-label">Total owed</p>
          <p className="stat-value stat-value--lg">
            <Money value={totalOwed} />
          </p>
        </div>
      </div>

      {data.length === 0 ? (
        <Card>
          <EmptyState
            icon="wallet"
            title="No accounts yet"
            description="Add the bank account, wallet or card you actually use."
            action={<Button onClick={() => setEditor({ account: null })}>New account</Button>}
          />
        </Card>
      ) : null}

      {[
        { key: 'asset', title: 'Assets', items: assets },
        { key: 'liability', title: 'Liabilities', items: liabilities },
      ].map((group) =>
        group.items.length ? (
          <section key={group.key} className="account-section">
            <h2 className="section-title">{group.title}</h2>
            <div className="account-grid">
              {group.items.map((account) => (
                <article
                  key={account.id}
                  className={`account-card ${account.is_active ? '' : 'is-archived'}`.trim()}
                >
                  <div className="account-card__head">
                    <div>
                      <h3>{account.name}</h3>
                      <p className="account-card__meta">
                        {SUBTYPE_LABELS[account.subtype] || account.subtype} · {account.currency}
                      </p>
                    </div>
                    {account.is_active ? null : <span className="badge">Archived</span>}
                  </div>
                  <p className="account-card__label">
                    {account.type === 'liability' ? 'Outstanding' : 'Balance'}
                  </p>
                  <p className="account-card__balance">
                    <Money value={account.balance_cents} />
                  </p>
                  <div className="account-card__actions">
                    <Button variant="ghost" size="sm" onClick={() => setEditor({ account })}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(account)}>
                      {account.is_active ? 'Archive' : 'Restore'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(account)}>
                      Delete
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null,
      )}

      {editor ? (
        <AccountEditor
          account={editor.account}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            notify(editor.account ? 'Account updated.' : 'Account created.')
            reload()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this account?"
        body={`${pendingDelete?.name || 'The account'} will leave the ledger. If entries still reference it, archive it instead.`}
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
