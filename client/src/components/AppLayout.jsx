import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { Icon } from './Icon.jsx'

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: 'dashboard', end: true }],
  },
  {
    label: 'Ledger',
    items: [
      { to: '/transactions', label: 'Transactions', icon: 'transactions' },
      { to: '/accounts', label: 'Accounts', icon: 'wallet' },
      { to: '/categories', label: 'Categories', icon: 'tag' },
    ],
  },
  {
    label: 'Planning',
    items: [
      { to: '/budgets', label: 'Budgets', icon: 'trending' },
      { to: '/goals', label: 'Goals', icon: 'target' },
      { to: '/debts', label: 'Debts', icon: 'card' },
      { to: '/subscriptions', label: 'Subscriptions', icon: 'repeat' },
    ],
  },
]

const MOBILE_PRIMARY = [
  { to: '/', label: 'Home', icon: 'dashboard', end: true },
  { to: '/transactions', label: 'Ledger', icon: 'transactions' },
  { to: '/budgets', label: 'Budgets', icon: 'trending' },
  { to: '/goals', label: 'Goals', icon: 'target' },
]

const MOBILE_MORE = [
  { to: '/accounts', label: 'Accounts', icon: 'wallet' },
  { to: '/categories', label: 'Categories', icon: 'tag' },
  { to: '/debts', label: 'Debts', icon: 'card' },
  { to: '/subscriptions', label: 'Subscriptions', icon: 'repeat' },
]

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const [sheetOpen, setSheetOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    setSheetOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!sheetOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSheetOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [sheetOpen])

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <aside className="rail">
        <div className="rail__brand">
          <span className="brand__mark">FT</span>
          <span className="rail__brand-name">Finance Tracker</span>
        </div>

        <nav className="rail__nav" aria-label="Primary">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="rail__group">
              <p className="rail__label">{group.label}</p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `rail__link ${isActive ? 'is-active' : ''}`.trim()}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="rail__foot">
          <div className="rail__user">
            <span className="avatar">{initials(user?.display_name || user?.email)}</span>
            <span className="rail__user-meta">
              <strong>{user?.display_name || 'Your ledger'}</strong>
              <small>{user?.email}</small>
            </span>
          </div>
          <button type="button" className="rail__logout" onClick={handleLogout}>
            <Icon name="logout" size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <header className="mobile-head">
        <div className="rail__brand">
          <span className="brand__mark">FT</span>
          <span className="rail__brand-name">Finance Tracker</span>
        </div>
        <span className="avatar avatar--sm">{initials(user?.display_name || user?.email)}</span>
      </header>

      <main id="main" className="main">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Primary">
        {MOBILE_PRIMARY.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `tabbar__link ${isActive ? 'is-active' : ''}`.trim()}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`tabbar__link ${sheetOpen ? 'is-active' : ''}`}
          aria-expanded={sheetOpen}
          aria-controls="more-sheet"
          onClick={() => setSheetOpen(true)}
        >
          <Icon name="more" size={19} />
          <span>More</span>
        </button>
      </nav>

      {sheetOpen ? (
        <div className="sheet-layer" onClick={() => setSheetOpen(false)}>
          <aside
            id="more-sheet"
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More sections"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet__head">
              <p className="eyebrow">More</p>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSheetOpen(false)}
                aria-label="Close menu"
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="sheet__links">
              {MOBILE_MORE.map((item) => (
                <NavLink key={item.to} to={item.to} className="sheet__link">
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  <Icon name="arrow" size={16} className="sheet__arrow" />
                </NavLink>
              ))}
            </div>
            <button type="button" className="btn btn--secondary btn--md sheet__logout" onClick={handleLogout}>
              <Icon name="logout" size={16} />
              Sign out
            </button>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
