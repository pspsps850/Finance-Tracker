import { Link } from 'react-router-dom'
import { Icon } from './Icon.jsx'
import { isMock } from '../api.js'

export function AuthShell({ eyebrow, title, description, children, footer }) {
  return (
    <main className="auth">
      <section className="auth__brand" aria-hidden="true">
        <div className="auth__brand-top">
          <span className="brand__mark">FT</span>
          <span className="auth__brand-name">Finance Tracker</span>
        </div>

        <div className="auth__statement">
          <p className="eyebrow">Personal ledger · PHP</p>
          <h2>
            Every peso has
            <br />
            a place to land.
          </h2>
          <p className="auth__brand-copy">
            Accounts, budgets, goals and debts in one passbook — no spreadsheets, no guesswork.
          </p>
        </div>

        <div className="auth__ledger">
          <div className="auth__ledger-row">
            <span>Savings</span>
            <span className="auth__ledger-rule" />
            <span>₱85,000.00</span>
          </div>
          <div className="auth__ledger-row">
            <span>Budget left</span>
            <span className="auth__ledger-rule" />
            <span>₱4,250.00</span>
          </div>
          <div className="auth__ledger-row">
            <span>Net position</span>
            <span className="auth__ledger-rule" />
            <span>₱78,120.00</span>
          </div>
        </div>

        <span className="stamp stamp--auth">Verified</span>
      </section>

      <section className="auth__panel">
        <div className="auth__card">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="auth__title">{title}</h1>
          {description ? <p className="auth__description">{description}</p> : null}
          {children}
          {footer ? <div className="auth__footer">{footer}</div> : null}
        </div>
        <p className="auth__aside">
          <Icon name="target" size={15} />{' '}
          {isMock ? 'Demo data stays in this browser.' : 'Your ledger is private to your account.'}
        </p>
      </section>
    </main>
  )
}
