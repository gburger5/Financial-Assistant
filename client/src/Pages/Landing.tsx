import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Container,
  Typography,
  Button,
  Grid,
  Paper,
  Stack
} from '@mui/material'
import {
  TrendingUp,
  AccountBalance,
  Insights,
  Security,
  ArrowForward,
  CheckCircleOutline,
} from '@mui/icons-material'
import { getToken, clearToken } from '../utils/auth'
import './Landing.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

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
    icon: <TrendingUp sx={{ fontSize: 32 }} />,
    title: 'Goal-Driven Budgets',
    desc: "Tell us what you're working toward. We build a personalized plan around your goals.",
  },
  {
    icon: <AccountBalance sx={{ fontSize: 32 }} />,
    title: 'Bank Sync via Plaid',
    desc: 'Connect your accounts securely in seconds. We analyze your real spending — no guesswork.',
  },
  {
    icon: <Insights sx={{ fontSize: 32 }} />,
    title: 'Spending Insights',
    desc: 'See exactly where your money goes, category by category, month over month.',
  },
  {
    icon: <Security sx={{ fontSize: 32 }} />,
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

const TRUST_ITEMS: string[] = [
  '🔒 Bank-level security',
  '🏦 Plaid-powered',
  '📊 Smart budgeting',
  '✦ AI insights',
]

function Landing() {
  const navigate = useNavigate()

  useEffect(() => {
    const checkExistingSession = async (): Promise<void> => {
      const token = getToken()

      if (!token) return

      try {
        const res = await fetch(`${API_BASE}/verify`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        })

        if (res.ok) {
          navigate('/dashboard')
        } else {
          clearToken()
        }
      } catch {
        // Server unreachable keep token try again next visit
      }
    }

    checkExistingSession()
  }, [navigate])

  return (
    <Box className="landing-container">
      <Box className="landing-background">
        <Box className="gradient-orb orb-1" />
        <Box className="gradient-orb orb-2" />
        <Box className="gradient-orb orb-3" />
      </Box>

      {/* ── Navbar ── */}
      <Box className="landing-nav">
        <Container maxWidth="xl">
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2 }}>
            <Box className="logo-container" sx={{ mb: 0 }}>
              <Box className="logo-icon" />
              <Typography variant="h5" component="span" className="logo-text">
                FinanceAI
              </Typography>
            </Box>
            <Stack direction="row" spacing={1.5}>
              <Button variant="text" onClick={() => navigate('/login')} className="nav-login-btn">
                Log in
              </Button>
              <Button
                variant="contained"
                onClick={() => navigate('/signup')}
                className="nav-signup-btn"
                endIcon={<ArrowForward />}
              >
                Get started
              </Button>
            </Stack>
          </Box>
        </Container>
      </Box>

      {/* Hero */}
      <Container maxWidth="md" className="landing-hero">
        <Box className="landing-hero-inner">
          <Typography variant="h1" component="h1" className="hero-headline">
            Your money,<br />finally under control.
          </Typography>
          <Typography variant="h6" component="p" className="hero-subtext">
            FinanceAI connects your accounts, analyzes your spending, and builds
            a personalized budget that actually works — in minutes.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" sx={{ mt: 4 }}>
            <Button
              variant="contained"
              size="large"
              className="hero-cta-primary"
              endIcon={<ArrowForward />}
              onClick={() => navigate('/signup')}
            >
              Start for free
            </Button>
            <Button
              variant="outlined"
              size="large"
              className="hero-cta-secondary"
              onClick={() => navigate('/login')}
            >
              Sign in
            </Button>
          </Stack>
          <Stack direction="row" spacing={3} justifyContent="center" flexWrap="wrap" sx={{ mt: 5 }} className="trust-strip">
            {TRUST_ITEMS.map((item) => (
              <Typography key={item} variant="body2" className="trust-item">{item}</Typography>
            ))}
          </Stack>
        </Box>
      </Container>

      {/* Features Grid */}
      <Box className="features-section">
        <Container maxWidth="lg">
          <Typography variant="h4" component="h2" className="section-title" sx={{ mb: 1 }}>
            Everything you need to take control
          </Typography>
          <Typography variant="body1" className="section-subtitle" sx={{ mb: 5 }}>
            Built for people who want clarity, not complexity.
          </Typography>
          <Grid container spacing={3}>
            {FEATURES.map((f) => (
              <Grid item xs={12} sm={6} key={f.title}>
                <Paper elevation={0} className="feature-card">
                  <Box className="feature-icon">{f.icon}</Box>
                  <Typography variant="h6" className="feature-title" sx={{ mt: 2, mb: 1 }}>{f.title}</Typography>
                  <Typography variant="body2" className="feature-desc">{f.desc}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Preview + Checklist */}
      <Box className="checklist-section">
        <Container maxWidth="md">
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="h4" component="h2" className="section-title" sx={{ mb: 2, textAlign: 'left' }}>
                Set up in minutes,<br />not hours.
              </Typography>
              <Typography variant="body1" className="section-subtitle" sx={{ mb: 3, textAlign: 'left' }}>
                Answer a few questions about your goals and lifestyle. We handle the rest.
              </Typography>
              <Stack spacing={1.5}>
                {CHECKLIST.map((item) => (
                  <Box key={item} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CheckCircleOutline className="check-icon" />
                    <Typography variant="body1" className="check-label">{item}</Typography>
                  </Box>
                ))}
              </Stack>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper elevation={0} className="checklist-card">
                <Typography variant="overline" className="card-overline">Your monthly snapshot</Typography>
                <Typography variant="h3" className="card-big-number" sx={{ my: 1 }}>$4,800</Typography>
                <Typography variant="body2" className="card-caption">Monthly take-home</Typography>
                <Box className="budget-bar-row" sx={{ mt: 3 }}>
                  {BUDGET_BARS.map((b) => (
                    <Box key={b.label} sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" className="bar-label">{b.label}</Typography>
                        <Typography variant="caption" className="bar-pct">{b.pct}%</Typography>
                      </Box>
                      <Box className="bar-track">
                        <Box className="bar-fill" style={{ width: `${b.pct}%`, background: b.color }} />
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* ── Bottom CTA ── */}
      <Box className="bottom-cta-section">
        <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
          <Typography variant="h4" component="h2" className="bottom-cta-title" sx={{ mb: 2 }}>
            Ready to get started?
          </Typography>
          <Typography variant="body1" className="bottom-cta-sub" sx={{ mb: 4 }}>
            It's free. No credit card required. Takes less than 5 minutes.
          </Typography>
          <Button
            variant="contained"
            size="large"
            className="hero-cta-primary"
            endIcon={<ArrowForward />}
            onClick={() => navigate('/signup')}
            fullWidth
          >
            Create my free account
          </Button>
          <Typography variant="body2" sx={{ mt: 2 }} className="already-account">
            Already have an account?{' '}
            <span onClick={() => navigate('/login')} className="already-account-link">
              Sign in
            </span>
          </Typography>
        </Container>
      </Box>

    </Box>
  )
}

export default Landing