import { parseMoney } from './money.js'

const required = (value) => value !== undefined && value !== null && String(value).trim() !== ''

export function validateAccount(values) {
  const errors = {}
  if (!required(values.name)) errors.name = 'Give the account a name.'
  if (!required(values.type)) errors.type = 'Choose a type.'
  if (!required(values.subtype)) errors.subtype = 'Choose a subtype.'
  if (parseMoney(values.opening_balance) === null) {
    errors.opening_balance = 'Enter a valid amount.'
  }
  return errors
}

export function validateTransaction(values) {
  const errors = {}
  if (!required(values.account_id)) errors.account_id = 'Choose an account.'
  if (parseMoney(values.amount) === null || parseMoney(values.amount) <= 0) {
    errors.amount = 'Enter an amount greater than zero.'
  }
  if (!required(values.occurred_at)) errors.occurred_at = 'Choose when it happened.'
  if (values.kind === 'transfer') {
    if (!required(values.to_account_id)) errors.to_account_id = 'Choose the destination account.'
    if (required(values.to_account_id) && values.to_account_id === values.account_id) {
      errors.to_account_id = 'Pick a different account for the transfer.'
    }
  }
  return errors
}

export function validateBudget(values) {
  const errors = {}
  if (!required(values.category_id)) errors.category_id = 'Choose a category.'
  if (!required(values.month)) errors.month = 'Choose the budget month.'
  if (parseMoney(values.limit) === null || parseMoney(values.limit) <= 0) {
    errors.limit = 'Set a limit greater than zero.'
  }
  return errors
}

export function validateGoal(values) {
  const errors = {}
  if (!required(values.name)) errors.name = 'Name the goal.'
  if (parseMoney(values.target) === null || parseMoney(values.target) <= 0) {
    errors.target = 'Set a target greater than zero.'
  }
  return errors
}

export function validateSubscription(values) {
  const errors = {}
  if (!required(values.name)) errors.name = 'Name the subscription.'
  if (parseMoney(values.amount) === null || parseMoney(values.amount) <= 0) {
    errors.amount = 'Enter an amount greater than zero.'
  }
  if (!required(values.billing_cycle)) errors.billing_cycle = 'Choose a billing cycle.'
  if (!required(values.next_due_date)) errors.next_due_date = 'Choose the next due date.'
  return errors
}

export function validateDebt(values) {
  const errors = {}
  if (!required(values.name)) errors.name = 'Name the debt.'
  if (parseMoney(values.principal) === null || parseMoney(values.principal) <= 0) {
    errors.principal = 'Enter the original amount.'
  }
  if (parseMoney(values.current_balance) === null) {
    errors.current_balance = 'Enter the current balance.'
  }
  return errors
}

export function validateOtp(code) {
  if (!/^\d{6}$/.test(String(code ?? '').trim())) {
    return { code: 'Enter the 6-digit code from the email.' }
  }
  return {}
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0
}
