export const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
]

export const ACCOUNT_SUBTYPES = {
  asset: [
    { value: 'bank', label: 'Bank account' },
    { value: 'cash', label: 'Cash' },
    { value: 'ewallet', label: 'E-wallet' },
    { value: 'investment', label: 'Investment' },
    { value: 'other', label: 'Other asset' },
  ],
  liability: [
    { value: 'credit_card', label: 'Credit card' },
    { value: 'loan', label: 'Loan' },
    { value: 'mortgage', label: 'Mortgage' },
    { value: 'other', label: 'Other liability' },
  ],
}

export const CATEGORY_TYPES = [
  { value: 'needs', label: 'Needs' },
  { value: 'wants', label: 'Wants' },
  { value: 'savings', label: 'Savings' },
  { value: 'income', label: 'Income' },
  { value: 'interest', label: 'Interest' },
  { value: 'transfer', label: 'Transfer' },
]

export const EXPENSE_CATEGORY_TYPES = ['needs', 'wants', 'interest']
export const BUDGETABLE_CATEGORY_TYPES = ['needs', 'wants', 'savings']

export const BILLING_CYCLES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

export const GOAL_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'achieved', label: 'Achieved' },
  { value: 'archived', label: 'Archived' },
]

export const CYCLE_LABELS = Object.fromEntries(
  BILLING_CYCLES.map((cycle) => [cycle.value, cycle.label]),
)

export const SUBTYPE_LABELS = Object.fromEntries(
  Object.values(ACCOUNT_SUBTYPES)
    .flat()
    .map((subtype) => [subtype.value, subtype.label]),
)

export const CATEGORY_TYPE_LABELS = Object.fromEntries(
  CATEGORY_TYPES.map((type) => [type.value, type.label]),
)

export function monthlyEquivalentCents(amountCents, cycle) {
  const amount = Number(amountCents) || 0
  if (cycle === 'weekly') return Math.round((amount * 52) / 12)
  if (cycle === 'quarterly') return Math.round(amount / 3)
  if (cycle === 'yearly') return Math.round(amount / 12)
  return amount
}
