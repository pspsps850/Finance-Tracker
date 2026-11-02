import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App } from './App.jsx'

function renderSignedIn(path) {
  localStorage.setItem('ft_mock_session', '1')
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

const pages = [
  ['/', 'Net position'],
  ['/transactions', 'Transactions'],
  ['/accounts', 'Accounts'],
  ['/categories', 'Categories'],
  ['/budgets', 'Budgets'],
  ['/goals', 'Goals'],
  ['/debts', 'Debts'],
  ['/subscriptions', 'Subscriptions'],
]

describe('signed-in routes', () => {
  it.each(pages)('renders %s without crashing', async (path, heading) => {
    renderSignedIn(path)
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeTruthy()
  })

  it('renders goal cards with formatted target amounts', async () => {
    renderSignedIn('/goals')

    expect(await screen.findByRole('heading', { level: 1, name: 'Goals' })).toBeTruthy()
    expect(await screen.findByText('Emergency fund')).toBeTruthy()
    expect(await screen.findByText(/of ₱150,000/)).toBeTruthy()
  })

  it('renders subscriptions without leaking debt records', async () => {
    renderSignedIn('/subscriptions')

    expect(await screen.findByText('Netflix')).toBeTruthy()
    expect(screen.queryByText('Car loan')).toBeNull()
    expect(screen.queryByText(/No route for GET \/api\/debts/)).toBeNull()
  })

  it('saves a subscription with the selected billing cycle', async () => {
    const user = userEvent.setup()
    renderSignedIn('/subscriptions')

    await screen.findByText('Netflix')
    await user.click(screen.getByRole('button', { name: 'New subscription' }))

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'Disney Plus')
    await user.type(within(dialog).getByLabelText('Amount'), '1499.00')
    await user.selectOptions(within(dialog).getByLabelText('Billing cycle'), 'yearly')
    await user.click(within(dialog).getByRole('button', { name: 'Track subscription' }))

    expect(await screen.findByText('Subscription added.')).toBeTruthy()
    expect(await screen.findByText('Disney Plus')).toBeTruthy()
    expect(screen.queryByText('Choose a billing cycle.')).toBeNull()
  })

  it('records a transaction through the composer and refreshes the ledger', async () => {
    const user = userEvent.setup()
    renderSignedIn('/transactions')

    await screen.findByRole('heading', { level: 1, name: 'Transactions' })
    await user.click(screen.getByRole('button', { name: 'New entry' }))

    const dialog = await screen.findByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Account'), '1')
    await user.selectOptions(within(dialog).getByLabelText('Category'), '2')
    await user.type(within(dialog).getByLabelText('Amount'), '250.00')
    await user.type(within(dialog).getByLabelText('Description'), 'Coffee with the team')
    await user.click(within(dialog).getByRole('button', { name: 'Record entry' }))

    expect(await screen.findByText('Entry recorded.')).toBeTruthy()
    expect(await screen.findByText('Coffee with the team')).toBeTruthy()
  })
})
