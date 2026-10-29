import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, isMock } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { AuthShell } from '../components/AuthShell.jsx'
import { Button } from '../components/Button.jsx'
import { Field, FormError, Input } from '../components/Form.jsx'
import { DEMO_OTP } from '../lib/demo.js'
import { errorMessage } from '../lib/errors.js'
import { validateOtp } from '../lib/validation.js'

export function VerifyOtp() {
  const [params] = useSearchParams()
  const email = params.get('email') || ''
  const justSent = params.get('sent') === '1'
  const { verifyOtp } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [fieldError, setFieldError] = useState(null)
  const [notice, setNotice] = useState(justSent ? 'Code sent. Check the inbox for that address.' : '')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const onSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    const errors = validateOtp(code)
    setFieldError(errors.code || null)
    if (errors.code) return

    setBusy(true)
    try {
      await verifyOtp({ email, code: code.trim() })
      navigate('/', { replace: true })
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setError(null)
    try {
      await api.resendOtp({ email })
      setNotice('A fresh code is on its way.')
      setCooldown(60)
    } catch (caught) {
      setError(caught)
    }
  }

  if (!email) {
    return (
      <AuthShell
        eyebrow="Verify email"
        title="Start with your email"
        description="We need the address the code was sent to."
      >
        <Link className="btn btn--primary btn--md btn--block" to="/register">
          Create an account
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow="One more step"
      title="Check your email"
      description={`Enter the 6-digit code sent to ${email}.`}
      footer={
        <p>
          Wrong address? <Link to="/register">Start over</Link>
        </p>
      }
    >
      <form className="form" onSubmit={onSubmit} noValidate>
        <Field label="Verification code" htmlFor="otp-code" error={fieldError}>
          <Input
            id="otp-code"
            className="otp-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            aria-describedby="otp-hint"
          />
        </Field>
        <p id="otp-hint" className="form-note">
          Codes expire after 10 minutes.
          {isMock ? ` Demo code: ${DEMO_OTP}.` : ''}
        </p>

        {notice ? <p className="form-notice">{notice}</p> : null}
        <FormError>{error ? errorMessage(error) : null}</FormError>

        <Button type="submit" loading={busy} className="btn--block">
          Verify and open ledger
        </Button>
        <Button variant="ghost" onClick={resend} disabled={cooldown > 0} className="btn--block">
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
        </Button>
      </form>
    </AuthShell>
  )
}
