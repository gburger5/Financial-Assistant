/**
 * Dev Mock — UI testing without a backend
 *
 * How it works:
 *   1. Seeds a fake JWT in localStorage so AuthContext authenticates
 *   2. Monkey-patches window.fetch to intercept API calls
 *   3. Returns realistic mock data for every endpoint the frontend uses
 *
 * Enable:  set VITE_DEV_MODE=true in .env (or .env.local)
 * Disable: remove the variable or set it to anything else
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/* ── Mock User ────────────────────────────────────────── */
const MOCK_USER = {
  userId: 'dev-user-001',
  firstName: 'Alex',
  lastName: 'Morgan',
  email: 'alex@financeai.dev',
  createdAt: '2024-09-15T10:30:00.000Z',
  agentBudgetApproved: true,
}

/* ── Mock Budget ──────────────────────────────────────── */
const MOCK_BUDGET = {
  userId: 'dev-user-001',
  budgetId: 'budget-001',
  createdAt: '2025-01-10T08:00:00.000Z',
  income:         { amount: 6200 },
  housing:        { amount: 1550 },
  utilities:      { amount: 220 },
  transportation: { amount: 380 },
  groceries:      { amount: 520 },
  takeout:        { amount: 280 },
  shopping:       { amount: 350 },
  personalCare:   { amount: 120 },
  debts:          { amount: 650 },
  investments:    { amount: 930 },
}

/* ── Mock Transactions ────────────────────────────────── */
const MOCK_TRANSACTIONS = [
  { plaidTransactionId: 'tx-001', name: 'Whole Foods Market',     merchantName: 'Whole Foods',    category: 'Groceries',      amount: -87.43,  date: '2025-03-24', pending: false },
  { plaidTransactionId: 'tx-002', name: 'Netflix',                merchantName: 'Netflix',        category: 'Entertainment',  amount: -15.99,  date: '2025-03-23', pending: false },
  { plaidTransactionId: 'tx-003', name: 'Shell Gas Station',      merchantName: 'Shell',          category: 'Transportation', amount: -52.10,  date: '2025-03-22', pending: false },
  { plaidTransactionId: 'tx-004', name: 'Direct Deposit - Employer', merchantName: null,           category: 'Income',         amount: 3100.00, date: '2025-03-21', pending: false },
  { plaidTransactionId: 'tx-005', name: 'Target',                 merchantName: 'Target',         category: 'Shopping',       amount: -134.56, date: '2025-03-20', pending: false },
  { plaidTransactionId: 'tx-006', name: 'Chipotle',               merchantName: 'Chipotle',       category: 'Takeout',        amount: -12.85,  date: '2025-03-19', pending: false },
  { plaidTransactionId: 'tx-007', name: 'Duke Energy',            merchantName: 'Duke Energy',    category: 'Utilities',      amount: -142.30, date: '2025-03-18', pending: false },
  { plaidTransactionId: 'tx-008', name: 'Spotify',                merchantName: 'Spotify',        category: 'Entertainment',  amount: -9.99,   date: '2025-03-17', pending: false },
  { plaidTransactionId: 'tx-009', name: 'Amazon',                 merchantName: 'Amazon',         category: 'Shopping',       amount: -67.22,  date: '2025-03-16', pending: false },
  { plaidTransactionId: 'tx-010', name: 'Publix',                 merchantName: 'Publix',         category: 'Groceries',      amount: -63.11,  date: '2025-03-15', pending: false },
  { plaidTransactionId: 'tx-011', name: 'Starbucks',              merchantName: 'Starbucks',      category: 'Takeout',        amount: -6.45,   date: '2025-03-14', pending: false },
  { plaidTransactionId: 'tx-012', name: 'Vanguard Transfer',      merchantName: 'Vanguard',       category: 'Investments',    amount: -500.00, date: '2025-03-13', pending: false },
  { plaidTransactionId: 'tx-013', name: 'Rent Payment',           merchantName: null,             category: 'Housing',        amount: -1550.00,date: '2025-03-01', pending: false },
  { plaidTransactionId: 'tx-014', name: 'T-Mobile',               merchantName: 'T-Mobile',       category: 'Utilities',      amount: -78.00,  date: '2025-03-12', pending: false },
  { plaidTransactionId: 'tx-015', name: 'Uber',                   merchantName: 'Uber',           category: 'Transportation', amount: -24.50,  date: '2025-03-11', pending: false },
].map((tx) => ({
  ...tx,
  userId: 'dev-user-001',
  sortKey: tx.date,
  plaidAccountId: 'acct-checking-001',
  detailedCategory: null,
  categoryIconUrl: null,
  isoCurrencyCode: 'USD',
  unofficialCurrencyCode: null,
  createdAt: tx.date + 'T12:00:00.000Z',
  updatedAt: tx.date + 'T12:00:00.000Z',
}))

/* ── Mock Accounts ────────────────────────────────────── */
const MOCK_ACCOUNTS = [
  {
    plaidAccountId: 'acct-checking-001',
    itemId: 'item-001',
    name: 'Everyday Checking',
    officialName: 'Chase Total Checking',
    mask: '4821',
    type: 'depository',
    subtype: 'checking',
    currentBalance: 4230.55,
    availableBalance: 4180.55,
    limitBalance: null,
    isoCurrencyCode: 'USD',
  },
  {
    plaidAccountId: 'acct-savings-001',
    itemId: 'item-001',
    name: 'High-Yield Savings',
    officialName: 'Chase Savings',
    mask: '7712',
    type: 'depository',
    subtype: 'savings',
    currentBalance: 12840.00,
    availableBalance: 12840.00,
    limitBalance: null,
    isoCurrencyCode: 'USD',
  },
  {
    plaidAccountId: 'acct-credit-001',
    itemId: 'item-001',
    name: 'Freedom Unlimited',
    officialName: 'Chase Freedom Unlimited',
    mask: '3309',
    type: 'credit',
    subtype: 'credit card',
    currentBalance: 1245.67,
    availableBalance: null,
    limitBalance: 8000,
    isoCurrencyCode: 'USD',
  },
  {
    plaidAccountId: 'acct-invest-001',
    itemId: 'item-002',
    name: 'Brokerage',
    officialName: 'Vanguard Individual Brokerage',
    mask: '5501',
    type: 'investment',
    subtype: 'brokerage',
    currentBalance: 34520.18,
    availableBalance: null,
    limitBalance: null,
    isoCurrencyCode: 'USD',
  },
].map((a) => ({
  ...a,
  userId: 'dev-user-001',
  updatedAt: '2025-03-24T08:00:00.000Z',
  createdAt: '2024-09-20T10:00:00.000Z',
  unofficialCurrencyCode: null,
}))

/* ── Mock Proposals ───────────────────────────────────── */
const MOCK_PROPOSALS = [
  {
    proposalId: 'prop-001',
    type: 'budget',
    status: 'pending',
    summary: 'Reduce takeout spending by $80/month and redirect to emergency savings. Your takeout spending is 30% above the recommended threshold for your income level.',
    rationale: 'Your current takeout spending of $280/month is 4.5% of income. Reducing to $200/month frees up $960/year for your emergency fund, which is currently below the recommended 3-month threshold.',
    createdAt: '2025-03-22T14:00:00.000Z',
    updatedAt: '2025-03-22T14:00:00.000Z',
  },
  {
    proposalId: 'prop-002',
    type: 'investing',
    status: 'pending',
    summary: 'Increase monthly investment contribution by $150 to take advantage of your surplus. Your current savings rate could be improved without impacting your lifestyle budget.',
    rationale: 'After covering all expenses and debt payments, you have approximately $200 in unallocated funds each month. Directing $150 of this toward your Vanguard account would increase your annual investment growth by roughly 19%.',
    createdAt: '2025-03-20T09:00:00.000Z',
    updatedAt: '2025-03-20T09:00:00.000Z',
  },
  {
    proposalId: 'prop-003',
    type: 'debt',
    status: 'executed',
    summary: 'Switch from minimum payments to avalanche method on your credit card balance. This would save approximately $340 in interest over the next 12 months.',
    rationale: 'Your Chase Freedom Unlimited card carries a 22.99% APR. Paying an extra $100/month above the minimum would clear the balance 8 months sooner.',
    createdAt: '2025-03-10T11:00:00.000Z',
    updatedAt: '2025-03-12T16:00:00.000Z',
  },
  {
    proposalId: 'prop-004',
    type: 'budget',
    status: 'rejected',
    summary: 'Reduce shopping budget by $120/month to accelerate debt payoff.',
    rationale: 'Your discretionary shopping at $350/month is in the top quartile for your income bracket. A $120 reduction would still leave you with $230/month while freeing up $1,440/year for debt reduction.',
    createdAt: '2025-03-05T08:30:00.000Z',
    updatedAt: '2025-03-06T10:00:00.000Z',
  },
]

/* ── Route matcher ────────────────────────────────────── */
interface MockRoute {
  method: string
  pattern: RegExp
  handler: () => unknown
  status?: number
}

const routes: MockRoute[] = [
  // Auth
  { method: 'GET',    pattern: /\/api\/auth\/verify$/,             handler: () => MOCK_USER },
  { method: 'POST',   pattern: /\/api\/auth\/login$/,              handler: () => ({ user: MOCK_USER, token: 'dev-mock-token', refreshToken: 'dev-mock-refresh' }) },
  { method: 'POST',   pattern: /\/api\/auth\/register$/,           handler: () => ({ user: MOCK_USER, token: 'dev-mock-token', refreshToken: 'dev-mock-refresh' }) },
  { method: 'POST',   pattern: /\/api\/auth\/logout$/,             handler: () => null, status: 204 },
  { method: 'POST',   pattern: /\/api\/auth\/refresh$/,            handler: () => ({ accessToken: 'dev-mock-token', refreshToken: 'dev-mock-refresh' }) },
  { method: 'PATCH',  pattern: /\/api\/auth\/profile\/password$/,  handler: () => ({ message: 'Password updated' }) },
  { method: 'DELETE', pattern: /\/api\/auth\/account$/,            handler: () => null, status: 204 },
  { method: 'POST',   pattern: /\/api\/auth\/forgot-password$/,    handler: () => ({ message: 'If that email is registered you will receive a reset link' }) },
  { method: 'POST',   pattern: /\/api\/auth\/reset-password$/,     handler: () => ({ message: 'Password has been reset' }) },

  // Budget
  { method: 'GET',    pattern: /\/api\/budget$/,             handler: () => MOCK_BUDGET },
  { method: 'PATCH',  pattern: /\/api\/budget$/,             handler: () => MOCK_BUDGET },
  { method: 'GET',    pattern: /\/api\/budget\/history$/,    handler: () => [MOCK_BUDGET] },

  // Transactions
  { method: 'GET',    pattern: /\/api\/transactions/,        handler: () => ({ transactions: MOCK_TRANSACTIONS }) },

  // Accounts
  { method: 'GET',    pattern: /\/api\/accounts$/,           handler: () => ({ accounts: MOCK_ACCOUNTS }) },

  // Plaid
  { method: 'POST',   pattern: /\/api\/plaid\/sync$/,        handler: () => ({ synced: true }), status: 200 },
  { method: 'POST',   pattern: /\/api\/plaid\//,             handler: () => ({ status: 'ok' }) },

  // Agent / Proposals
  { method: 'GET',    pattern: /\/api\/agent\/proposals$/,   handler: () => ({ proposals: MOCK_PROPOSALS }) },
  { method: 'POST',   pattern: /\/api\/agent\/.+\/respond$/, handler: () => ({ status: 'ok' }) },
  { method: 'DELETE', pattern: /\/api\/agent\/proposals\//,  handler: () => null, status: 204 },
]

/* ── Fetch interceptor ────────────────────────────────── */
export function installDevMock(): void {
  // Seed a token so AuthContext picks it up
  if (!localStorage.getItem('token')) {
    localStorage.setItem('token', 'dev-mock-token')
  }

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? 'GET').toUpperCase()

    // Only intercept calls to our API
    if (!url.startsWith(API_BASE)) {
      return originalFetch(input, init)
    }

    const path = url.replace(API_BASE, '')

    for (const route of routes) {
      if (route.method === method && route.pattern.test(path)) {
        // Simulate network latency (200–500ms)
        await new Promise((r) => setTimeout(r, 200 + Math.random() * 300))

        const body = route.handler()
        const status = route.status ?? 200

        console.log(`[DevMock] ${method} ${path} → ${status}`, body)

        return new Response(
          status === 204 ? null : JSON.stringify(body),
          {
            status,
            statusText: status === 204 ? 'No Content' : 'OK',
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
    }

    // Unmatched API route — return 404 so the app handles it gracefully
    console.warn(`[DevMock] Unmatched: ${method} ${path}`)
    return new Response(JSON.stringify({ error: 'Not found (dev mock)' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log(
    '%c[DevMock] Active — all API calls return mock data',
    'color: #00D4AA; font-weight: bold; font-size: 13px',
  )
}