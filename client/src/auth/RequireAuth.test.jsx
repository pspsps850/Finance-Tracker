import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../auth/AuthContext.jsx'
import { PublicOnly, RequireAuth } from '../auth/RequireAuth.jsx'

function renderGuarded(status, initialEntry = '/private') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthContext.Provider value={{ status }}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/private" element={<p>private ledger</p>} />
          </Route>
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<p>login screen</p>} />
          </Route>
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  it('redirects anonymous visitors to the login screen', () => {
    renderGuarded('anonymous')
    expect(screen.getByText('login screen')).toBeTruthy()
    expect(screen.queryByText('private ledger')).toBeNull()
  })

  it('renders the protected route for an authenticated session', () => {
    renderGuarded('authenticated')
    expect(screen.getByText('private ledger')).toBeTruthy()
  })

  it('shows the splash screen while the session is loading', () => {
    renderGuarded('loading')
    expect(screen.getByText('Opening the ledger…')).toBeTruthy()
  })
})

describe('PublicOnly', () => {
  it('sends an authenticated user back to the dashboard', () => {
    renderGuarded('authenticated', '/login')
    expect(screen.queryByText('login screen')).toBeNull()
  })
})
