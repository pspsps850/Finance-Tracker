import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App } from './App.jsx'

function renderApp(entry = '/login') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <App />
    </MemoryRouter>,
  )
}

describe('app shell', () => {
  it('shows the sign-in screen for an anonymous visitor', async () => {
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Sign in to your ledger' })).toBeTruthy()
  })

  it('signs in with the demo account and lands on a populated dashboard', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: /use the demo account/i }))
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByRole('heading', { name: 'Net position' })).toBeTruthy()
    expect(await screen.findByText('Latest entries')).toBeTruthy()
    expect(screen.getByText('Budget left this month')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Transactions' })).toBeTruthy()
  })

  it('reports invalid credentials without leaving the form', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.type(await screen.findByLabelText('Email'), 'demo@financetracker.test')
    await user.type(screen.getByLabelText('Password'), 'not-the-password')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByText('Email or password is incorrect.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Sign in to your ledger' })).toBeTruthy()
  })
})
