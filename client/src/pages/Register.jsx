import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { AuthShell } from '../components/AuthShell.jsx'
import { Button } from '../components/Button.jsx'
import { Field, FormError, Input } from '../components/Form.jsx'
import { errorMessage, fieldErrors } from '../lib/errors.js'

export function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    display_name: '',
    email: '',
    password: '',
    confirm: '',
  })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const onSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    const nextErrors = {}
    if (!form.display_name.trim()) nextErrors.display_name = 'Tell us what to call you.'
    if (!form.email.includes('@')) nextErrors.email = 'Enter a valid email address.'
    if (form.password.length < 8) nextErrors.password = 'Use at least 8 characters.'
    if (form.password !== form.confirm) nextErrors.confirm = 'The passwords do not match.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setBusy(true)
    try {
      await register({
        display_name: form.display_name.trim(),
        email: form.email.trim(),
        password: form.password,
      })
      navigate(`/verify-otp?email=${encodeURIComponent(form.email.trim())}&sent=1`)
    } catch (caught) {
      setErrors(fieldErrors(caught))
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      eyebrow="New ledger"
      title="Start your passbook"
      description="One account is all it takes to begin."
      footer={
        <p>
          Already have one? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      <form className="form" onSubmit={onSubmit} noValidate>
        <Field label="Name" htmlFor="register-name" error={errors.display_name}>
          <Input
            id="register-name"
            autoComplete="name"
            value={form.display_name}
            onChange={update('display_name')}
            placeholder="Ana Reyes"
          />
        </Field>
        <Field label="Email" htmlFor="register-email" error={errors.email}>
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={update('email')}
            placeholder="you@example.com"
          />
        </Field>
        <div className="form-row">
          <Field label="Password" htmlFor="register-password" error={errors.password} hint="At least 8 characters.">
            <Input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={update('password')}
            />
          </Field>
          <Field label="Confirm" htmlFor="register-confirm" error={errors.confirm}>
            <Input
              id="register-confirm"
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={update('confirm')}
            />
          </Field>
        </div>

        <FormError>{error ? errorMessage(error) : null}</FormError>

        <Button type="submit" loading={busy} className="btn--block">
          Create account
        </Button>
        <p className="form-note">We will email a 6-digit code to confirm the address.</p>
      </form>
    </AuthShell>
  )
}
