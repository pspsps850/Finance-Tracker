import { useState } from 'react'
import { api } from '../api.js'
import { Button } from '../components/Button.jsx'
import { Card } from '../components/Card.jsx'
import { ConfirmDialog } from '../components/ConfirmDialog.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorState } from '../components/ErrorState.jsx'
import { Field, FormError, Input, Select } from '../components/Form.jsx'
import { LoadingPage } from '../components/Loading.jsx'
import { Modal } from '../components/Modal.jsx'
import { PageHeader } from '../components/PageHeader.jsx'
import { useToast } from '../components/Toast.jsx'
import { CATEGORY_TYPES, CATEGORY_TYPE_LABELS } from '../lib/constants.js'
import { errorMessage, fieldErrors } from '../lib/errors.js'
import { useResource } from '../lib/useResource.js'

function CategoryEditor({ category, categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: category?.name ?? '',
    type: category?.type ?? 'needs',
    parent_id: category?.parent_id ? String(category.parent_id) : '',
    color: category?.color ?? '#4f6b57',
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const update = (key) => (event) => {
    const value = event?.target ? event.target.value : event
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'type' ? { parent_id: '' } : {}),
    }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setFormError(null)
    if (!form.name.trim()) {
      setErrors({ name: 'Give the category a name.' })
      return
    }
    setErrors({})

    const payload = {
      name: form.name.trim(),
      type: form.type,
      parent_id: form.parent_id ? Number(form.parent_id) : null,
      color: form.color,
    }

    setBusy(true)
    try {
      if (category) await api.categories.update(category.id, payload)
      else await api.categories.create(payload)
      onSaved()
    } catch (caught) {
      setErrors(fieldErrors(caught))
      setFormError(caught)
    } finally {
      setBusy(false)
    }
  }

  const parentOptions = categories
    .filter((item) => item.id !== category?.id && item.type === form.type)
    .map((item) => ({ value: item.id, label: item.name }))

  return (
    <Modal
      open
      onClose={onClose}
      title={category ? 'Edit category' : 'New category'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {category ? 'Save changes' : 'Create category'}
          </Button>
        </>
      }
    >
      <form className="form" onSubmit={submit} noValidate>
        <Field label="Name" htmlFor="category-name" error={errors.name}>
          <Input
            id="category-name"
            value={form.name}
            onChange={update('name')}
            placeholder="Groceries"
          />
        </Field>
        <div className="form-row">
          <Field label="Type" htmlFor="category-type" error={errors.type}>
            <Select id="category-type" value={form.type} onChange={update('type')} options={CATEGORY_TYPES} />
          </Field>
          <Field label="Parent" htmlFor="category-parent" hint="Optional. Groups child categories under one heading.">
            <Select
              id="category-parent"
              value={form.parent_id}
              onChange={update('parent_id')}
              options={parentOptions}
              placeholder="No parent"
            />
          </Field>
        </div>
        <Field label="Colour" htmlFor="category-color" hint="Used for the swatch in lists and charts.">
          <div className="color-field">
            <input
              id="category-color"
              type="color"
              value={form.color}
              onChange={update('color')}
              aria-label="Category colour"
            />
            <span className="mono">{form.color.toUpperCase()}</span>
          </div>
        </Field>
        <FormError>{formError ? errorMessage(formError) : null}</FormError>
      </form>
    </Modal>
  )
}

export function Categories() {
  const notify = useToast()
  const { data: categories, loading, error, reload } = useResource(() => api.categories.list(), [])
  const [editor, setEditor] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.categories.remove(pendingDelete.id)
      notify('Category deleted.')
      setPendingDelete(null)
      reload()
    } catch (caught) {
      setPendingDelete(null)
      notify(errorMessage(caught), 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (loading && !categories) {
    return (
      <div className="page">
        <PageHeader eyebrow="Ledger" title="Categories" />
        <LoadingPage label="Loading categories" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <PageHeader eyebrow="Ledger" title="Categories" />
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  const parentName = (id) => categories.find((category) => category.id === id)?.name

  return (
    <div className="page">
      <PageHeader
        eyebrow="Ledger"
        title="Categories"
        description="The labels that make budgets and reports mean something."
        actions={<Button onClick={() => setEditor({ category: null })}>New category</Button>}
      />

      {categories.length === 0 ? (
        <Card>
          <EmptyState
            icon="tag"
            title="No categories yet"
            description="Start with the four or five things you spend on every week."
            action={<Button onClick={() => setEditor({ category: null })}>New category</Button>}
          />
        </Card>
      ) : null}

      {CATEGORY_TYPES.map((type) => {
        const items = categories.filter((category) => category.type === type.value)
        if (!items.length) return null
        return (
          <Card key={type.value} className="category-section">
            <div className="category-section__head">
              <h2 className="section-title">{type.label}</h2>
              <span className="badge">{items.length}</span>
            </div>
            <ul className="category-list">
              {items.map((category) => (
                <li key={category.id} className="category-row">
                  <span
                    className="category-row__swatch"
                    style={{ background: category.color || 'var(--rule)' }}
                    aria-hidden="true"
                  />
                  <span className="category-row__name">
                    {category.name}
                    {category.parent_id ? (
                      <small>under {parentName(category.parent_id) || 'a deleted category'}</small>
                    ) : null}
                  </span>
                  <span className="category-row__type">
                    {CATEGORY_TYPE_LABELS[category.type] || category.type}
                  </span>
                  <span className="category-row__actions">
                    <button
                      type="button"
                      className="row-action"
                      onClick={() => setEditor({ category })}
                      aria-label={`Edit ${category.name}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="row-action row-action--danger"
                      onClick={() => setPendingDelete(category)}
                      aria-label={`Delete ${category.name}`}
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )
      })}

      {editor ? (
        <CategoryEditor
          category={editor.category}
          categories={categories}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            notify(editor.category ? 'Category updated.' : 'Category created.')
            reload()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this category?"
        body={`${pendingDelete?.name || 'The category'} can only be removed once no transactions, budgets or subscriptions point at it.`}
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
