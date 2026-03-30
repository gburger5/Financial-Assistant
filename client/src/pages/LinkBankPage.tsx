import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { CheckCircle } from 'lucide-react'
import { api, ApiError } from '../services/api'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'
import type { Budget, BudgetGoal } from '../types/budget'
import { BUDGET_GOALS } from '../types/budget'
import type { Proposal } from '../types/proposal'
import type { Account } from '../types/account'
import './LinkBankPage.css'

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="onboard__steps" aria-label={`Step ${current} of 6`}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className={[
            'onboard__step-dot',
            i < current ? 'onboard__step-dot--done' : '',
            i === current ? 'onboard__step-dot--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ))}
    </div>
  )
}

// ─── Budget categories config ─────────────────────────────────────────────────

const BUDGET_CATEGORIES = [
  { key: 'income',         label: 'Monthly Income',      icon: '💰', section: 'Income' },
  { key: 'housing',        label: 'Housing / Rent',      icon: '🏠', section: 'Needs' },
  { key: 'utilities',      label: 'Utilities',           icon: '💡', section: 'Needs' },
  { key: 'transportation', label: 'Transportation',      icon: '🚗', section: 'Needs' },
  { key: 'groceries',      label: 'Groceries',           icon: '🛒', section: 'Needs' },
  { key: 'personalCare',   label: 'Personal Care',       icon: '💅', section: 'Needs' },
  { key: 'medical',        label: 'Medical',             icon: '🏥', section: 'Needs' },
  { key: 'takeout',        label: 'Dining Out',          icon: '🍽️', section: 'Wants' },
  { key: 'shopping',       label: 'Shopping',            icon: '🛍️', section: 'Wants' },
  { key: 'entertainment',  label: 'Entertainment',       icon: '🎭', section: 'Wants' },
  { key: 'emergencyFund',  label: 'Emergency Fund',      icon: '🛟', section: 'Savings' },
  { key: 'investments',    label: 'Monthly Investments',  icon: '📈', section: 'Savings' },
  { key: 'debts',          label: 'Debt Payments',       icon: '💳', section: 'Savings' },
] as const

type BudgetKey = (typeof BUDGET_CATEGORIES)[number]['key']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProposedAmount(result: Record<string, unknown>, key: BudgetKey): number | null {
  const val = result[key]
  return typeof val === 'number' ? val : null
}

function fmt(v: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v)
}

function diff(current: number, proposed: number) {
  const d = proposed - current
  if (d === 0) return { label: '—', positive: null }
  return { label: (d > 0 ? '+' : '') + fmt(d), positive: d > 0 }
}

/** Goal display labels — capitalize for UI presentation */
const GOAL_LABELS: Record<BudgetGoal, string> = {
  'pay down debt': 'Pay Down Debt',
  'maximize investments': 'Maximize Investments',
  'build a strong emergency fund': 'Build Emergency Fund',
  'save for big purchase': 'Save for Big Purchase',
  'lower overall spending': 'Lower Spending',
  'have more fun money': 'More Fun Money',
}

// ─── Connected bank display ───────────────────────────────────────────────────

interface ConnectedBank {
  institutionName: string
  accounts: Account[]
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SyncStatus {
  itemsLinked: number
  itemsSynced: number
  ready: boolean
}

const MAX_REJECTIONS = 3

export default function LinkBankPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1
  const [banksConnected, setBanksConnected] = useState(0)
  const [connectedBanks, setConnectedBanks] = useState<ConnectedBank[]>([])
  const [linkLoading, setLinkLoading] = useState(false)

  // Step 2
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [syncTimedOut, setSyncTimedOut] = useState(false)
  const syncTriggeredRef = useRef(false)

  // Step 3
  const [birthday, setBirthday] = useState('')
  const [selectedGoals, setSelectedGoals] = useState<Set<BudgetGoal>>(new Set())
  const [validationError, setValidationError] = useState<string | null>(null)

  // Step 4
  const [budget, setBudget] = useState<Budget | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentError, setAgentError] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectCount, setRejectCount] = useState(0)

  // ─── Resume onboarding on mount ─────────────────────────────────────────────

  useEffect(() => {
    if (user?.agentBudgetApproved) {
      navigate('/dashboard')
      return
    }

    async function resumeOnboarding() {
      try {
        // Check if budget already exists — user is past questionnaire
        const existingBudget = await api.get<Budget>('/api/budget')
        setBudget(existingBudget)
        setStep(4)
        return
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) return
      }

      // No budget — check sync status
      try {
        const status = await api.get<SyncStatus>('/api/plaid/sync-status')
        if (status.itemsLinked > 0) {
          // Restore connected banks display from accounts API
          try {
            const { accounts } = await api.get<{ accounts: Account[] }>('/api/accounts')
            if (accounts.length > 0) {
              const grouped = groupAccountsByItem(accounts)
              setConnectedBanks(grouped)
              setBanksConnected(grouped.length)
            }
          } catch { /* accounts fetch failed — just show count */ }

          if (status.ready) {
            setStep(3) // Sync done, go to questionnaire
          } else {
            setStep(2) // Sync in progress
          }
        }
        // else stay on step 1
      } catch {
        // stay on step 1
      }
    }

    resumeOnboarding()
  }, [user, navigate])

  // ─── Step 2: trigger sync + poll ──────────────────────────────────────────

  useEffect(() => {
    if (step !== 2) return

    let cancelled = false
    const TIMEOUT_MS = 2 * 60 * 1000
    const start = Date.now()

    // Trigger sync once (guard against React Strict Mode double-fire)
    if (!syncTriggeredRef.current) {
      syncTriggeredRef.current = true
      api.post('/api/plaid/sync').catch(() => {})
    }

    async function poll() {
      while (!cancelled) {
        if (Date.now() - start > TIMEOUT_MS) {
          if (!cancelled) setSyncTimedOut(true)
          return
        }

        try {
          const status = await api.get<SyncStatus>('/api/plaid/sync-status')
          if (!cancelled) setSyncStatus(status)

          if (status.ready) {
            if (!cancelled) setStep(3)
            return
          }
        } catch {
          // network error — retry
        }

        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    poll()
    return () => { cancelled = true }
  }, [step])

  // ─── Step 4: budget init + agent ──────────────────────────────────────────

  useEffect(() => {
    if (step !== 4 || user?.agentBudgetApproved) return
    // Skip if we already have a proposal or are already loading
    if (proposal || agentLoading) return
    // Only run the init sequence if we don't have a budget yet (first entry)
    // If budget exists from resume, just run the agent
    let cancelled = false

    async function initAndRunAgent() {
      setAgentLoading(true)
      setAgentError(null)
      setError(null)

      try {
        let currentBudget = budget

        if (!currentBudget) {
          // Save birthday
          await api.patch('/api/auth/profile', { birthday })

          // Initialize budget with goals
          currentBudget = await api.post<Budget>('/api/budget/initialize', {
            goals: Array.from(selectedGoals),
          })
          if (!cancelled) setBudget(currentBudget)
        }

        // Run budget agent
        const proposalResponse = await api.post<Proposal>('/api/agent/budget')
        if (!cancelled) setProposal(proposalResponse)
      } catch (err) {
        if (!cancelled) {
          // If we have a budget, agent failed — show fallback
          // If no budget, init failed — show error
          const msg =
            budget != null || err instanceof ApiError
              ? 'AI recommendations unavailable. You can review your budget manually.'
              : 'Failed to initialize budget. Please try again.'
          setAgentError(msg)
        }
      } finally {
        if (!cancelled) setAgentLoading(false)
      }
    }

    initAndRunAgent()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // ─── Step 6: auto-redirect ────────────────────────────────────────────────

  useEffect(() => {
    if (step !== 6) return
    const timer = setTimeout(() => navigate('/dashboard'), 5000)
    return () => clearTimeout(timer)
  }, [step, navigate])

  // ─── Plaid Link ───────────────────────────────────────────────────────────

  async function openPlaidLink() {
    setLinkLoading(true)
    setError(null)
    try {
      const { linkToken } = await api.get<{ linkToken: string }>('/api/plaid/link-token')

      const handler = Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            const result = await api.post<{ message: string; itemId: string }>(
              '/api/plaid/exchange-token',
              {
                publicToken,
                institutionId: metadata.institution?.institution_id ?? '',
                institutionName: metadata.institution?.name ?? '',
              },
            )

            const institutionName = metadata.institution?.name ?? 'Connected Bank'

            // Fetch accounts for this item to display
            try {
              const { accounts } = await api.get<{ accounts: Account[] }>('/api/accounts')
              const itemAccounts = accounts.filter((a) => a.itemId === result.itemId)
              setConnectedBanks((prev) => [
                ...prev,
                { institutionName, accounts: itemAccounts },
              ])
            } catch {
              // Accounts fetch failed — still show the bank as connected
              setConnectedBanks((prev) => [
                ...prev,
                { institutionName, accounts: [] },
              ])
            }

            setBanksConnected((prev) => prev + 1)
          } catch {
            setError('Failed to link bank account. Please try again.')
          } finally {
            setLinkLoading(false)
          }
        },
        onExit: () => setLinkLoading(false),
      })

      handler.open()
    } catch {
      setError('Failed to create link token. Please try again.')
      setLinkLoading(false)
    }
  }

  // ─── Step 3: goal toggle ──────────────────────────────────────────────────

  function toggleGoal(goal: BudgetGoal) {
    setSelectedGoals((prev) => {
      const next = new Set(prev)
      if (next.has(goal)) {
        next.delete(goal)
      } else {
        next.add(goal)
      }
      return next
    })
    setValidationError(null)
  }

  function handleQuestionnaireSubmit() {
    if (!birthday) {
      setValidationError('Please enter your date of birth.')
      return
    }
    if (selectedGoals.size === 0) {
      setValidationError('Please select at least one financial goal.')
      return
    }
    setValidationError(null)
    setStep(4)
  }

  // ─── Step 4: agent accept / reject ────────────────────────────────────────

  async function handleAccept() {
    if (!proposal) return
    setLoading(true)
    setError(null)
    try {
      await api.post(`/api/agent/proposals/${proposal.proposalId}/approve`)
      await api.post(`/api/agent/proposals/${proposal.proposalId}/execute`)
      const updated = await api.get<Budget>('/api/budget')
      setBudget(updated)
      setStep(5)
    } catch {
      setError('Failed to apply recommendation. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReject() {
    if (!proposal) return
    if (!rejectionReason.trim()) {
      setError('Please provide a reason so the agent can revise.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await api.post(`/api/agent/proposals/${proposal.proposalId}/reject`)
      setRejectCount((c) => c + 1)

      // Request a new proposal
      const newProposal = await api.post<Proposal>('/api/agent/budget')
      setProposal(newProposal)
      setRejectionReason('')
      setShowRejectInput(false)
    } catch {
      setError('Failed to get revised recommendation. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Step 5: confirm ──────────────────────────────────────────────────────

  function handleConfirm() {
    setLoading(true)
    try {
      // Fire debt/investing agents only if allocations are nonzero
      if (budget && budget.debts.amount > 0) {
        api.post('/api/agent/debt', { debtAllocation: budget.debts.amount }).catch(() => {})
      }
      if (budget && budget.investments.amount > 0) {
        api.post('/api/agent/investing', { investingAllocation: budget.investments.amount }).catch(() => {})
      }
      setStep(6)
    } finally {
      setLoading(false)
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Groups accounts by itemId for display when institution names are unavailable (resume). */
  function groupAccountsByItem(accounts: Account[]): ConnectedBank[] {
    const map = new Map<string, Account[]>()
    for (const acct of accounts) {
      const list = map.get(acct.itemId) ?? []
      list.push(acct)
      map.set(acct.itemId, list)
    }
    return Array.from(map.entries()).map(([, accts]) => ({
      institutionName: accts[0]?.name ?? 'Connected Bank',
      accounts: accts,
    }))
  }

  // ─── Render helpers ───────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <div className="onboard__step-content page">
        <StepIndicator current={1} />
        <h2 className="onboard__title">Connect your bank account</h2>
        <p className="onboard__subtitle">
          Link one or more banks so we can analyze your transactions and build your budget.
          Your credentials are never stored.
        </p>

        <div className="onboard__trust-badges">
          <span className="onboard__trust-badge">🔒 Bank-level encryption</span>
          <span className="onboard__trust-badge">👁 Read-only access</span>
          <span className="onboard__trust-badge">🛡️ 256-bit SSL</span>
        </div>

        {connectedBanks.length > 0 && (
          <div className="onboard__bank-list">
            {connectedBanks.map((bank, idx) => (
              <div key={idx} className="onboard__bank-item">
                <div className="onboard__bank-name">
                  <Badge variant="success">{bank.institutionName}</Badge>
                </div>
                {bank.accounts.length > 0 && (
                  <div className="onboard__bank-accounts">
                    {bank.accounts.map((acct) => (
                      <span key={acct.plaidAccountId} className="onboard__bank-account">
                        {acct.name}{acct.mask ? ` ••${acct.mask}` : ''} — {acct.type}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="onboard__error" role="alert">{error}</p>}

        <Button
          variant="primary"
          fullWidth
          onClick={openPlaidLink}
          disabled={linkLoading}
        >
          {linkLoading
            ? <><Spinner size="sm" /> Connecting...</>
            : banksConnected > 0
              ? 'Link another bank'
              : 'Connect bank'}
        </Button>

        <Button
          variant="cta"
          fullWidth
          disabled={banksConnected === 0 || linkLoading}
          onClick={() => setStep(2)}
        >
          Continue
        </Button>
      </div>
    )
  }

  function renderStep2() {
    if (syncTimedOut) {
      return (
        <div className="onboard__step-content page">
          <StepIndicator current={2} />
          <p className="onboard__error" role="alert">
            Sync timed out. Please try again.
          </p>
          <Button variant="primary" onClick={() => { setSyncTimedOut(false); syncTriggeredRef.current = false; setStep(1) }}>
            Start over
          </Button>
        </div>
      )
    }

    return (
      <div className="onboard__step-content onboard__step-content--center page">
        <StepIndicator current={2} />
        <Spinner size="lg" />
        <h2 className="onboard__title">Syncing your accounts...</h2>
        <p className="onboard__subtitle">
          We're pulling your transaction history. This usually takes 10-30 seconds.
        </p>
        {syncStatus && (
          <p className="onboard__sync-progress">
            {syncStatus.itemsSynced} of {syncStatus.itemsLinked} accounts synced
          </p>
        )}
      </div>
    )
  }

  function renderStep3() {
    return (
      <div className="onboard__step-content page">
        <StepIndicator current={3} />
        <h2 className="onboard__title">Tell us about yourself</h2>
        <p className="onboard__subtitle">
          This helps us personalize your budget and investment recommendations.
        </p>

        <div className="onboard__questionnaire">
          <div className="onboard__date-field">
            <label className="onboard__field-label" htmlFor="birthday">Date of Birth</label>
            <input
              id="birthday"
              type="date"
              className="onboard__date-input"
              value={birthday}
              onChange={(e) => { setBirthday(e.target.value); setValidationError(null) }}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div className="onboard__goals-section">
            <label className="onboard__field-label">What are your financial goals?</label>
            <p className="onboard__field-hint">Select at least one.</p>
            <div className="onboard__goals-grid">
              {BUDGET_GOALS.map((goal) => (
                <button
                  key={goal}
                  type="button"
                  className={[
                    'onboard__goal-card',
                    selectedGoals.has(goal) ? 'onboard__goal-card--selected' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => toggleGoal(goal)}
                  aria-pressed={selectedGoals.has(goal)}
                >
                  {GOAL_LABELS[goal]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {validationError && (
          <p className="onboard__validation-msg" role="alert">{validationError}</p>
        )}

        <Button
          variant="cta"
          fullWidth
          onClick={handleQuestionnaireSubmit}
        >
          Continue
        </Button>
      </div>
    )
  }

  function renderStep4() {
    if (agentLoading) {
      return (
        <div className="onboard__step-content onboard__step-content--center page">
          <StepIndicator current={4} />
          <Spinner size="lg" />
          <h2 className="onboard__title">Analyzing your finances...</h2>
          <p className="onboard__subtitle">
            We're building your budget and generating AI recommendations.
          </p>
        </div>
      )
    }

    if (agentError || !proposal) {
      return (
        <div className="onboard__step-content page">
          <StepIndicator current={4} />
          <h2 className="onboard__title">Your Budget</h2>
          {agentError && <p className="onboard__agent-note">{agentError}</p>}
          {!budget && error && <p className="onboard__error" role="alert">{error}</p>}
          {budget && (
            <>
              <p className="onboard__subtitle">Review your budget below.</p>
              {renderBudgetSummary(budget)}
            </>
          )}
          <Button variant="cta" fullWidth onClick={() => setStep(5)} disabled={!budget}>
            Continue
          </Button>
        </div>
      )
    }

    const result = proposal.result

    return (
      <div className="onboard__step-content page">
        <StepIndicator current={4} />
        <h2 className="onboard__title">AI Budget Recommendation</h2>
        <p className="onboard__subtitle">
          Our agent analyzed your spending and suggests these optimizations.
        </p>

        {(result as { summary?: string }).summary && (
          <p className="onboard__proposal-summary">
            {(result as { summary?: string }).summary}
          </p>
        )}

        {error && <p className="onboard__error" role="alert">{error}</p>}

        {/* Comparison table */}
        {budget && (
          <div className="onboard__comparison">
            <div className="onboard__comparison-header">
              <span>Category</span>
              <span>Current</span>
              <span>Proposed</span>
              <span>Change</span>
            </div>
            {BUDGET_CATEGORIES.map(({ key, label, icon }) => {
              const current = ((budget[key as BudgetKey] as { amount: number } | undefined)?.amount ?? 0)
              const proposedRaw = getProposedAmount(result, key)
              const proposed = proposedRaw ?? current
              const { label: diffLabel, positive } = diff(current, proposed)
              return (
                <div key={key} className="onboard__comparison-row">
                  <span>{icon} {label}</span>
                  <span className="onboard__num">{fmt(current)}</span>
                  <span className="onboard__num">{fmt(proposed)}</span>
                  <span
                    className={[
                      'onboard__num',
                      positive === true ? 'onboard__num--positive' : '',
                      positive === false ? 'onboard__num--negative' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {diffLabel}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Reject input */}
        {showRejectInput && (
          <div className="onboard__reject-form">
            <Input
              label="Reason for rejection"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Reduce housing budget more"
            />
            <div className="onboard__reject-actions">
              <Button variant="primary" size="sm" onClick={handleReject} disabled={loading}>
                {loading ? 'Revising...' : 'Submit & Revise'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowRejectInput(false); setRejectionReason('') }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="onboard__proposal-actions">
          <Button variant="cta" fullWidth onClick={handleAccept} disabled={loading || showRejectInput}>
            {loading ? 'Applying...' : 'Accept Recommendation'}
          </Button>

          {/* After first rejection, show Skip AI more prominently (before Reject) */}
          {rejectCount > 0 && !showRejectInput && (
            <Button variant="secondary" fullWidth onClick={() => setStep(5)} disabled={loading}>
              Skip AI — Review Manually
            </Button>
          )}

          {rejectCount < MAX_REJECTIONS && !showRejectInput && (
            <Button variant="secondary" fullWidth onClick={() => setShowRejectInput(true)} disabled={loading}>
              Reject & Revise
            </Button>
          )}

          {rejectCount === 0 && !showRejectInput && (
            <Button variant="ghost" fullWidth onClick={() => setStep(5)} disabled={loading}>
              Skip AI — Review Manually
            </Button>
          )}
        </div>
      </div>
    )
  }

  function renderBudgetSummary(b: Budget) {
    const sections = ['Income', 'Needs', 'Wants', 'Savings'] as const
    const totalExpenses = BUDGET_CATEGORIES.filter((c) => c.key !== 'income').reduce(
      (sum, { key }) => sum + ((b[key as BudgetKey] as { amount: number } | undefined)?.amount ?? 0),
      0,
    )
    const remaining = b.income.amount - totalExpenses

    return (
      <div className="onboard__budget-summary">
        {sections.map((section) => {
          const cats = BUDGET_CATEGORIES.filter((c) => c.section === section)
          return (
            <div key={section} className="onboard__budget-section">
              <p className="onboard__budget-section-header">{section}</p>
              {cats.map(({ key, label, icon }) => {
                const amount = ((b[key as BudgetKey] as { amount: number } | undefined)?.amount ?? 0)
                return (
                  <div key={key} className="onboard__budget-row">
                    <span>{icon} {label}</span>
                    <span className="onboard__num">{fmt(amount)}</span>
                  </div>
                )
              })}
            </div>
          )
        })}
        <div className="onboard__budget-totals">
          <div className="onboard__budget-row">
            <span>Total Expenses</span>
            <span className="onboard__num">{fmt(totalExpenses)}</span>
          </div>
          <div className="onboard__budget-row">
            <span>Remaining</span>
            <span className={`onboard__num ${remaining >= 0 ? 'onboard__num--positive' : 'onboard__num--negative'}`}>
              {fmt(remaining)}
            </span>
          </div>
        </div>
      </div>
    )
  }

  function renderStep5() {
    return (
      <div className="onboard__step-content page">
        <StepIndicator current={5} />
        <h2 className="onboard__title">Confirm your budget</h2>
        <p className="onboard__subtitle">
          Everything look good? Review the final numbers before we save.
        </p>

        {budget && renderBudgetSummary(budget)}

        <div className="onboard__proposal-actions">
          <Button variant="cta" fullWidth onClick={handleConfirm} disabled={loading}>
            {loading ? 'Finishing...' : 'Confirm & Finish'}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => navigate('/budget')}>
            Edit
          </Button>
        </div>
      </div>
    )
  }

  function renderStep6() {
    return (
      <div className="onboard__step-content onboard__step-content--center page">
        <StepIndicator current={6} />
        <div className="onboard__done-icon">
          <CheckCircle size={64} />
        </div>
        <h2 className="onboard__title">You're all set!</h2>
        <p className="onboard__subtitle">
          Your budget is ready. Head to the dashboard to see your financial overview.
          Redirecting in 5 seconds...
        </p>
        <Button variant="cta" onClick={() => navigate('/dashboard')}>
          Go to Dashboard
        </Button>
      </div>
    )
  }

  const stepRenderers = {
    1: renderStep1,
    2: renderStep2,
    3: renderStep3,
    4: renderStep4,
    5: renderStep5,
    6: renderStep6,
  }

  return (
    <div className="link-bank-page">
      <Card className="link-bank-page__card">
        {stepRenderers[step]()}
      </Card>
    </div>
  )
}
