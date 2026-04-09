import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  TrendingUp,
  Landmark,
  BarChart3,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Lock,
  Building2,
  PieChart,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import Button from '../components/ui/Button'
import './Landing.css'

/* ── Data ──────────────────────────────────────────────── */

interface Feature {
  icon: React.ReactNode
  title: string
  desc: string
}

interface BudgetBar {
  label: string
  pct: number
  color: string
}

const FEATURES: Feature[] = [
  {
    icon: <TrendingUp size={28} />,
    title: 'Goal-Driven Budgets',
    desc: "Tell us what you're working toward. We build a personalized plan around your goals.",
  },
  {
    icon: <Landmark size={28} />,
    title: 'Bank Sync via Plaid',
    desc: 'Connect your accounts securely in seconds. We analyze your real spending — no guesswork.',
  },
  {
    icon: <BarChart3 size={28} />,
    title: 'Spending Insights',
    desc: 'See exactly where your money goes, category by category, month over month.',
  },
  {
    icon: <ShieldCheck size={28} />,
    title: 'Debt Payoff Strategies',
    desc: 'Avalanche or snowball — we crunch the numbers and show you the fastest path out.',
  },
]

const CHECKLIST: string[] = [
  'Personalized budget in minutes',
  'Connect all your bank accounts',
  'Track every dollar automatically',
  'Smart alerts and recommendations',
]

const BUDGET_BARS: BudgetBar[] = [
  { label: 'Needs',   pct: 52, color: '#457B9D' },
  { label: 'Wants',   pct: 22, color: '#00D4AA' },
  { label: 'Savings', pct: 16, color: '#0A2540' },
  { label: 'Debt',    pct: 10, color: '#F59E0B' },
]

const TRUST_ITEMS: { icon: React.ReactNode; label: string }[] = [
  { icon: <Lock size={14} />,      label: 'Bank-level security' },
  { icon: <Building2 size={14} />,  label: 'Plaid-powered' },
  { icon: <PieChart size={14} />,   label: 'Smart budgeting' },
  { icon: <Sparkles size={14} />,   label: 'AI insights' },
]

/* ── Component ─────────────────────────────────────────── */

export default function Landing() {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()

  useEffect(() => {
    if (!isAuthenticated) return
    navigate(user?.agentBudgetApproved ? '/dashboard' : '/link-bank', { replace: true })
  }, [isAuthenticated, user, navigate])

  return (
    /*
     * data-theme="light" on this wrapper forces the Landing page
     * to always render with the light palette, regardless of OS
     * dark-mode preference. The dashboard pages will still
     * respect the user's theme choice.
     */
    <div className="landing" data-theme="light">
      {/* Background orbs */}
      <div className="landing__bg" aria-hidden="true">
        <div className="landing__orb landing__orb--1" />
        <div className="landing__orb landing__orb--2" />
        <div className="landing__orb landing__orb--3" />
      </div>

      {/* ── Navbar ───────────────────────────────────── */}
      <header className="landing__nav">
        <div className="landing__nav-inner">
          <Link to="/" className="landing__logo" aria-label="FinanceAI home">
            <span className="landing__logo-icon" aria-hidden="true" />
            <span className="landing__logo-text">FinanceAI</span>
          </Link>

          <nav className="landing__nav-actions">
            <Link to="/login" className="landing__nav-login">Log in</Link>
            <button
              className="landing__nav-signup"
              onClick={() => navigate('/signup')}
            >
              Get started <ArrowRight size={16} />
            </button>
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────── */}
      <section className="landing__hero">
        <h1 className="landing__headline">
          Your money,<br />finally under control.
        </h1>
        <p className="landing__subtext">
          FinanceAI connects your accounts, analyzes your spending, and builds
          a personalized budget that actually works — in minutes.
        </p>

        <div className="landing__ctas">
          <Button variant="cta" size="lg" onClick={() => navigate('/signup')}>
            Start for free <ArrowRight size={18} />
          </Button>
          <Button variant="secondary" size="lg" onClick={() => navigate('/login')}>
            Sign in
          </Button>
        </div>

        <div className="landing__trust">
          {TRUST_ITEMS.map((item) => (
            <span key={item.label} className="landing__trust-item">
              {item.icon} {item.label}
            </span>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────── */}
      <section className="landing__features">
        <div className="landing__wrap">
          <h2 className="landing__section-title">
            Everything you need to take control
          </h2>
          <p className="landing__section-sub">
            Built for people who want clarity, not complexity.
          </p>

          <div className="landing__features-grid">
            {FEATURES.map((f) => (
              <article key={f.title} className="landing__card">
                <div className="landing__card-icon">{f.icon}</div>
                <h3 className="landing__card-title">{f.title}</h3>
                <p className="landing__card-desc">{f.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Checklist + Preview ───────────────────────── */}
      <section className="landing__checklist">
        <div className="landing__wrap">
          <div className="landing__checklist-grid">
            <div className="landing__checklist-text">
              <h2 className="landing__section-title landing__section-title--left">
                Set up in minutes,<br />not hours.
              </h2>
              <p className="landing__section-sub landing__section-sub--left">
                Answer a few questions about your goals and lifestyle. We handle the rest.
              </p>

              <ul className="landing__checks">
                {CHECKLIST.map((item) => (
                  <li key={item} className="landing__check-item">
                    <CheckCircle2 size={20} className="landing__check-icon" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="landing__preview">
              <span className="landing__preview-overline">Your monthly snapshot</span>
              <strong className="landing__preview-amount">$4,800</strong>
              <span className="landing__preview-caption">Monthly take-home</span>

              <div className="landing__preview-bars">
                {BUDGET_BARS.map((b) => (
                  <div key={b.label} className="landing__bar">
                    <div className="landing__bar-header">
                      <span className="landing__bar-label">{b.label}</span>
                      <span className="landing__bar-pct">{b.pct}%</span>
                    </div>
                    <div className="landing__bar-track">
                      <div
                        className="landing__bar-fill"
                        style={{ width: `${b.pct}%`, background: b.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────── */}
      <section className="landing__cta-section">
        <div className="landing__cta-inner">
          <h2 className="landing__section-title">Ready to get started?</h2>
          <p className="landing__section-sub">
            It's free. No credit card required. Takes less than 5 minutes.
          </p>

          <Button variant="cta" size="lg" fullWidth onClick={() => navigate('/signup')}>
            Create my free account <ArrowRight size={18} />
          </Button>

          <p className="landing__cta-footer">
            Already have an account?{' '}
            <Link to="/login" className="landing__cta-link">Sign in</Link>
          </p>
        </div>
      </section>
    </div>
  )
}