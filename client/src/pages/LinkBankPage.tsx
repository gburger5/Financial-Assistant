import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { CheckCircle } from 'lucide-react'
import { api, ApiError } from '../services/api'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'
import type { Budget } from '../types/budget'
import type { Proposal } from '../types/proposal'
import './LinkBankPage.css'

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="onboard__steps" aria-label={`Step ${current} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
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
  { key: 'takeout',        label: 'Dining Out',          icon: '🍽️', section: 'Wants' },
  { key: 'shopping',       label: 'Shopping',            icon: '🛍️', section: 'Wants' },
  { key: 'investments',    label: 'Monthly Investments', icon: '📈', section: 'Savings' },
  { key: 'debts',          label: 'Debt Payments',       icon: '💳', section: 'Savings' },
] as const

type BudgetKey = (typeof BUDGET_CATEGORIES)[number]['key']

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Extract a proposed amount for a given budget key from the agent payload.
 * The payload uses a nested structure (needs/wants) with string numbers,
 * not the flat { amount: number } shape of Budget.
 */
function getProposedAmount(payload: Record<string, unknown>, key: BudgetKey): number | null {
  const p = payload as Record<string, unknown> & {
    income?: unknown
    needs?: Record<string, unknown>
    wants?: Record<string, unknown>
    debtAllocation?: unknown
    investingAllocation?: unknown
  }
  switch (key) {
    case 'income':         return p.income != null ? Number(p.income) : null
    case 'housing':        return p.needs?.housing != null ? Number(p.needs.housing) : null
    case 'utilities':      return p.needs?.utilities != null ? Number(p.needs.utilities) : null
    case 'transportation': {
      const car = p.needs?.carPayment != null ? Number(p.needs.carPayment) : 0
      const gas = p.needs?.gasFuel != null ? Number(p.needs.gasFuel) : 0
      return car + gas
    }
    case 'groceries':      return p.needs?.groceries != null ? Number(p.needs.groceries) : null
    case 'personalCare':   return p.needs?.personalCare != null ? Number(p.needs.personalCare) : null
    case 'takeout':        return p.wants?.takeout != null ? Number(p.wants.takeout) : null
    case 'shopping':       return p.wants?.shopping != null ? Number(p.wants.shopping) : null
    case 'investments':    return p.investingAllocation != null ? Number(p.investingAllocation) : null
    case 'debts':          return p.debtAllocation != null ? Number(p.debtAllocation) : null
    default:               return null
  }
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

// ─── Main component ───────────────────────────────────────────────────────────

interface SyncStatus {
  itemsLinked: number
  itemsSynced: number
  ready: boolean
}

export default function LinkBankPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1
  const [banksConnected, setBanksConnected] = useState(0)
  const [linkLoading, setLinkLoading] = useState(false)

  // Step 2
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [syncTimedOut, setSyncTimedOut] = useState(false)

  // Step 3
  const [budget, setBudget] = useState<Budget | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentError, setAgentError] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)

  // ─── Resume onboarding on mount ─────────────────────────────────────────────

  useEffect(() => {
    // If the user already accepted an agent proposal in a previous session,
    // the onboarding flow is complete — send them straight to the dashboard.
    if (user?.agentBudgetApproved) {
      navigate('/dashboard')
      return
    }

    async function resumeOnboarding() {
      try {
        const existingBudget = await api.get<Budget>('/api/budget')
        setBudget(existingBudget)
        setStep(3)
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          try {
            const status = await api.get<SyncStatus>('/api/plaid/sync-status')
            if (status.itemsLinked > 0) {
              setBanksConnected(status.itemsLinked)
              if (status.ready) {
                const initializedBudget = await api.post<Budget>('/api/budget/initialize')
                setBudget(initializedBudget)
                setStep(3)
              } else {
                setStep(2)
              }
            }
            // else stay on step 1
          } catch {
            // stay on step 1
          }
        }
      }
    }

    resumeOnboarding()
  }, [user, navigate])

  // ─── Step 2: polling ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (step !== 2) return

    let cancelled = false
    const TIMEOUT_MS = 2 * 60 * 1000 // 2 minutes
    const start = Date.now()

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
            try {
              const initializedBudget = await api.post<Budget>('/api/budget/initialize')
              if (!cancelled) {
                setBudget(initializedBudget)
                setStep(3)
              }
            } catch {
              if (!cancelled) setError('Failed to generate budget. Please try again.')
            }
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

  // ─── Step 3: agent proposal ──────────────────────────────────────────────────

  useEffect(() => {
    if (step !== 3 || !budget || user?.agentBudgetApproved) return

    let cancelled = false
    setAgentLoading(true)
    setAgentError(null)

    async function requestProposal() {
      try {
        const response = await api.post<{ proposal: Proposal }>('/api/agent/budget')
        if (!cancelled) {
          setProposal(response.proposal)
          setAgentLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof ApiError && err.status === 404
              ? 'AI recommendations coming soon.'
              : 'AI agent is currently unavailable. You can review your budget manually.'
          setAgentError(msg)
          setAgentLoading(false)
        }
      }
    }

    requestProposal()
    return () => { cancelled = true }
  }, [step, budget, user])

  // ─── Step 5: auto-redirect ───────────────────────────────────────────────────

  useEffect(() => {
    if (step !== 5) return
    const timer = setTimeout(() => navigate('/dashboard'), 5000)
    return () => clearTimeout(timer)
  }, [step, navigate])

  // ─── Plaid Link ──────────────────────────────────────────────────────────────

  async function openPlaidLink() {
    setLinkLoading(true)
    setError(null)
    try {
      const { linkToken } = await api.get<{ linkToken: string }>('/api/plaid/link-token')

      const handler = Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            await api.post('/api/plaid/exchange-token', {
              publicToken,
              institutionId: metadata.institution?.institution_id ?? '',
              institutionName: metadata.institution?.name ?? '',
            })
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

  // ─── Agent accept / reject ───────────────────────────────────────────────────

  async function handleAccept() {
    if (!proposal) return
    setLoading(true)
    setError(null)
    try {
      await api.post(`/api/agent/budget/${proposal.proposalId}/respond`, { approved: true })
      const updated = await api.get<Budget>('/api/budget')
      setBudget(updated)
      setStep(4)
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
      const response = await api.post<{ proposal: Proposal }>(
        `/api/agent/budget/${proposal.proposalId}/respond`,
        { approved: false, rejectionReason },
      )
      setProposal(response.proposal)
      setRejectionReason('')
      setShowRejectInput(false)
    } catch {
      setError('Failed to get revised recommendation. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Render helpers ──────────────────────────────────────────────────────────

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

        {banksConnected > 0 && (
          <div className="onboard__connected">
            <Badge variant="success">{banksConnected} bank{banksConnected > 1 ? 's' : ''} connected</Badge>
          </div>
        )}

        {error && <p className="onboard__error" role="alert">{error}</p>}

        <Button
          variant="primary"
          fullWidth
          onClick={openPlaidLink}
          disabled={linkLoading}
        >
          {linkLoading ? <><Spinner size="sm" /> Connecting…</> : banksConnected > 0 ? 'Link another bank' : 'Connect bank'}
        </Button>

        <Button
          variant="cta"
          fullWidth
          disabled={banksConnected === 0 || linkLoading}
          onClick={() => setStep(2)}
        >
          Continue →
        </Button>

        <Link to="/dashboard" className="onboard__skip">Skip for now</Link>
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
          <Button variant="primary" onClick={() => { setSyncTimedOut(false); setStep(1) }}>
            Start over
          </Button>
        </div>
      )
    }

    return (
      <div className="onboard__step-content onboard__step-content--center page">
        <StepIndicator current={2} />
        <Spinner size="lg" />
        <h2 className="onboard__title">Syncing your accounts…</h2>
        <p className="onboard__subtitle">
          We're pulling your transaction history. This usually takes 10–30 seconds.
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
    if (agentLoading) {
      return (
        <div className="onboard__step-content onboard__step-content--center page">
          <StepIndicator current={3} />
          <Spinner size="lg" />
          <h2 className="onboard__title">AI is analyzing your budget…</h2>
          <p className="onboard__subtitle">
            Our agent is reviewing your transactions and optimizing category allocations.
          </p>
        </div>
      )
    }

    if (agentError || !proposal) {
      return (
        <div className="onboard__step-content page">
          <StepIndicator current={3} />
          <h2 className="onboard__title">AI Budget Recommendation</h2>
          {agentError && <p className="onboard__agent-note">{agentError}</p>}
          <p className="onboard__subtitle">Review your budget below.</p>
          {budget && renderBudgetSummary(budget)}
          <Button variant="cta" fullWidth onClick={() => setStep(4)}>
            Continue →
          </Button>
        </div>
      )
    }

    return (
      <div className="onboard__step-content page">
        <StepIndicator current={3} />
        <h2 className="onboard__title">AI Budget Recommendation</h2>
        <p className="onboard__subtitle">
          Our agent analyzed your spending and suggests these optimizations.
        </p>

        <p className="onboard__proposal-summary">{proposal.summary}</p>

        {error && <p className="onboard__error" role="alert">{error}</p>}

        {/* Comparison table */}
        {budget && proposal.payload && (
          <div className="onboard__comparison">
            <div className="onboard__comparison-header">
              <span>Category</span>
              <span>Current</span>
              <span>Proposed</span>
              <span>Change</span>
            </div>
            {BUDGET_CATEGORIES.map(({ key, label, icon }) => {
              const current = (budget[key as BudgetKey] as { amount: number }).amount
              const proposedRaw = getProposedAmount(proposal.payload ?? {}, key)
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
                {loading ? 'Revising…' : 'Submit & Revise'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowRejectInput(false); setRejectionReason('') }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="onboard__proposal-actions">
          <Button variant="cta" fullWidth onClick={handleAccept} disabled={loading || showRejectInput}>
            {loading ? 'Applying…' : 'Accept Recommendation'}
          </Button>
          {!showRejectInput && (
            <Button variant="secondary" fullWidth onClick={() => setShowRejectInput(true)} disabled={loading}>
              Reject & Revise
            </Button>
          )}
          <Button variant="ghost" fullWidth onClick={() => setStep(4)} disabled={loading}>
            Skip AI — Review Manually
          </Button>
        </div>
      </div>
    )
  }

  function renderBudgetSummary(b: Budget) {
    const sections = ['Income', 'Needs', 'Wants', 'Savings'] as const
    const totalExpenses = BUDGET_CATEGORIES.filter((c) => c.key !== 'income').reduce(
      (sum, { key }) => sum + (b[key as BudgetKey] as { amount: number }).amount,
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
                const amount = (b[key as BudgetKey] as { amount: number }).amount
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

  function renderStep4() {
    return (
      <div className="onboard__step-content page">
        <StepIndicator current={4} />
        <h2 className="onboard__title">Confirm your budget</h2>
        <p className="onboard__subtitle">
          Everything look good? Review the final numbers before we save.
        </p>

        {budget && renderBudgetSummary(budget)}

        <div className="onboard__proposal-actions">
          <Button variant="cta" fullWidth onClick={() => setStep(5)}>
            Confirm & Finish
          </Button>
          <Button variant="ghost" fullWidth onClick={() => navigate('/budget')}>
            Edit
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setStep(3)}>
            Back to AI
          </Button>
        </div>
      </div>
    )
  }

  function renderStep5() {
    return (
      <div className="onboard__step-content onboard__step-content--center page">
        <StepIndicator current={5} />
        <div className="onboard__done-icon">
          <CheckCircle size={64} />
        </div>
        <h2 className="onboard__title">You're all set!</h2>
        <p className="onboard__subtitle">
          Your budget is ready. Head to the dashboard to see your financial overview.
          Redirecting in 5 seconds…
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
  }

  return (
    <div className="link-bank-page">
      <Card className="link-bank-page__card">
        {stepRenderers[step]()}
      </Card>
    </div>
  )
}
