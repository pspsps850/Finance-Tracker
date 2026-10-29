import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { isMock } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { AuthShell } from '../components/AuthShell.jsx'
import { Button } from '../components/Button.jsx'
import { Field, FormError, Input } from '../components/Form.jsx'
import { DEMO_EMAIL, DEMO_PASSWORD } from '../lib/demo.js'
import { errorMessage, isApiError } from '../lib/errors.js'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const onSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login({ email: form.email.trim(), password: form.password })
      navigate(location.state?.from || '/', { replace: true })
    } catch (caught) {
      if (isApiError(caught) && caught.code === 'email_unverified') {
        navigate(`/verify-otp?email=${encodeURIComponent(form.email.trim())}`)
        return
      }
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  const useDemo = () => {
    setForm({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
    setError(null)
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to your ledger"
      description="Pick up where the money left off."
      footer={
        <p>
          New here? <Link to="/register">Create an account</Link>
        </p>
      }
    >
      <form className="form" onSubmit={onSubmit} noValidate>
        <Field label="Email" htmlFor="login-email">
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={update('email')}
            placeholder="you@example.com"
            required
          />
        </Field>
        <Field label="Password" htmlFor="login-password">
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={update('password')}
            placeholder="••••••••"
            required
          />
        </Field>

        <FormError>{error ? errorMessage(error) : null}</FormError>

        <Button type="submit" loading={busy} className="btn--block">
          Sign in
        </Button>

        {isMock ? (
          <button type="button" className="demo-fill" onClick={useDemo}>
            Use the demo account
            <span>{DEMO_EMAIL} · {DEMO_PASSWORD}</span>
          </button>
        ) : null}
      </form>
    </AuthShell>
  )
}
