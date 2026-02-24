import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  TextField,
  MenuItem,
  Grid,
  InputAdornment,
  IconButton,
  Alert,
} from '@mui/material'
import { Close } from '@mui/icons-material'
import './Onboarding.css'

/* TYPES */
type StepId =
  | 'profile-name'
  | 'profile-goals'
  | 'profile-debt'
  | 'profile-home'
  | 'profile-travel'
  | 'income'
  | 'needs-housing'
  | 'needs-utils'
  | 'needs-other'
  | 'wants'
  | 'emergency'
  | 'invest-accts'
  | 'savings-goals'
  | 'debts'
  | 'preview'
  | 'plaid'

interface ProfileData {
  firstName: string
  lastName: string
  household: string
  hasDependents: string
  goals: string[]
  debtTypes: string[]
  homeType: string
  transport: string[]
}

interface SavingsGoal {
  name: string
  amount: string
  months: string
}

interface DebtDetail {
  balance: string
  rate: string
  minPayment: string
}

interface BudgetData {
  income: string
  incomeFreq: string
  // housing
  rent: string
  mortgage: string
  propertyTax: string
  homeInsurance: string
  rentersInsurance: string
  hoa: string
  // utils
  utilities: string
  internet: string
  phone: string
  water: string
  carPayment: string
  carInsurance: string
  gas: string
  parking: string
  transitCost: string
  // other needs
  groceries: string
  medical: string
  prescriptions: string
  personalCare: string
  childcare: string
  pets: string
  clothing: string
  hasPets: boolean
  // wants
  takeout: string
  dining: string
  entertainment: string
  shopping: string
  subscriptions: string
  travel: string
  hobbies: string
  gifts: string
  // emergency
  emergencyMonths: string
  emergencyCoverage: string
  // investments
  investAccts: string[]
  k401contrib: string
  k401match: string
  iraContrib: string
  // savings goals
  savingsGoals: SavingsGoal[]
  // debts
  debts: Record<string, DebtDetail>
}

interface CategoryRow {
  name: string
  amount: number
  type: 'needs' | 'wants' | 'savings' | 'debt'
  icon: string
}

interface BankOption {
  id: string
  name: string
  bg: string
  label: string
}

const PROFILE_STEPS: StepId[] = [
  'profile-name', 'profile-goals', 'profile-debt', 'profile-home', 'profile-travel',
]

const BUDGET_STEPS: StepId[] = [
  'income', 'needs-housing', 'needs-utils', 'needs-other',
  'wants', 'emergency', 'invest-accts', 'savings-goals', 'debts',
]

const ALL_STEPS: StepId[] = [...PROFILE_STEPS, ...BUDGET_STEPS, 'preview', 'plaid']

const PROFILE_LABELS: Record<string, string> = {
  'profile-name': 'About You',
  'profile-goals': 'Goals',
  'profile-debt': 'Debt',
  'profile-home': 'Housing',
  'profile-travel': 'Transport',
}

const BUDGET_LABELS: Record<string, string> = {
  income: 'Income',
  'needs-housing': 'Housing Costs',
  'needs-utils': 'Utilities',
  'needs-other': 'Other Needs',
  wants: 'Wants',
  emergency: 'Emergency Fund',
  'invest-accts': 'Investments',
  'savings-goals': 'Savings Goals',
  debts: 'Debts',
}

const DEBT_LABELS: Record<string, string> = {
  'credit-card': 'Credit Card',
  medical: 'Medical Debt',
  auto: 'Auto Loan',
  student: 'Student Loan',
  personal: 'Personal Loan',
  bnpl: 'Buy Now, Pay Later',
}

const TYPE_COLORS: Record<string, string> = {
  needs: '#457B9D',
  wants: '#F59E0B',
  savings: '#00D4AA',
  debt: '#EF4444',
}

const TYPE_LABELS: Record<string, string> = {
  needs: 'Needs',
  wants: 'Wants',
  savings: 'Savings & Investments',
  debt: 'Debt Payments',
}

const BANKS: BankOption[] = [
  { id: 'chase',  name: 'Chase',           bg: '#117ACA', label: 'CHASE ⊙' },
  { id: 'boa',    name: 'Bank of America', bg: '#E31837', label: 'BANK OF\nAMERICA' },
  { id: 'wells',  name: 'Wells Fargo',     bg: '#CD1409', label: 'WELLS\nFARGO' },
  { id: 'amex',   name: 'American Express',bg: '#016FD0', label: 'AMERICAN\nEXPRESS' },
  { id: 'schwab', name: 'Charles Schwab',  bg: '#00A0DF', label: 'charles\nSchwab' },
  { id: 'citi',   name: 'Citi',            bg: '#003B70', label: 'citi' },
]

const defaultProfile: ProfileData = {
  firstName: '', lastName: '', household: 'just-me', hasDependents: 'n',
  goals: [], debtTypes: [], homeType: '', transport: [],
}

// ✅ Reads name from sessionStorage (set during sign-up) and clears it immediately
const getInitialProfile = (): ProfileData => {
  const firstName = sessionStorage.getItem('onboarding_firstName') || ''
  const lastName  = sessionStorage.getItem('onboarding_lastName')  || ''

  return {
    ...defaultProfile,
    firstName,
    lastName,
  }
}

const defaultBudget: BudgetData = {
  income: '', incomeFreq: 'monthly',
  rent: '', mortgage: '', propertyTax: '', homeInsurance: '',
  rentersInsurance: '', hoa: '',
  utilities: '', internet: '', phone: '', water: '',
  carPayment: '', carInsurance: '', gas: '', parking: '', transitCost: '',
  groceries: '', medical: '', prescriptions: '', personalCare: '',
  childcare: '', pets: '', clothing: '', hasPets: false,
  takeout: '', dining: '', entertainment: '', shopping: '',
  subscriptions: '', travel: '', hobbies: '', gifts: '',
  emergencyMonths: '3', emergencyCoverage: 'needs-only',
  investAccts: [], k401contrib: '', k401match: '', iraContrib: '',
  savingsGoals: [],
  debts: {},
}

/* HELPERS */
const tog = (arr: string[], v: string): string[] =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]

const n = (v: string | undefined): number => Number(v) || 0

const calcBudget = (profile: ProfileData, budget: BudgetData): CategoryRow[] => {
  const rows: CategoryRow[] = []
  const add = (name: string, val: string | undefined, type: CategoryRow['type'], icon: string) => {
    if (n(val) > 0) rows.push({ name, amount: n(val), type, icon })
  }

  add(profile.homeType === 'own' ? 'Mortgage' : 'Rent', budget.rent || budget.mortgage, 'needs', '🏠')
  add('Property Tax', budget.propertyTax, 'needs', '🏛️')
  add('Home Insurance', budget.homeInsurance || budget.rentersInsurance, 'needs', '🛡️')
  add('HOA', budget.hoa, 'needs', '🏢')
  add('Electricity / Gas', budget.utilities, 'needs', '💡')
  add('Internet', budget.internet, 'needs', '📶')
  add('Phone', budget.phone, 'needs', '📱')
  add('Water / Trash', budget.water, 'needs', '💧')
  add('Car Payment', budget.carPayment, 'needs', '🚗')
  add('Auto Insurance', budget.carInsurance, 'needs', '🛡️')
  add('Gas / Fuel', budget.gas, 'needs', '⛽')
  add('Parking', budget.parking, 'needs', '🅿️')
  add('Transit', budget.transitCost, 'needs', '🚇')
  add('Groceries', budget.groceries, 'needs', '🛒')
  add('Medical', budget.medical, 'needs', '🏥')
  add('Prescriptions', budget.prescriptions, 'needs', '💊')
  add('Personal Care', budget.personalCare, 'needs', '✂️')
  add('Pet Care', budget.pets, 'needs', '🐾')
  add('Childcare', budget.childcare, 'needs', '👶')
  add('Clothing', budget.clothing, 'needs', '👕')
  add('Takeout / Delivery', budget.takeout, 'wants', '🍕')
  add('Dining Out', budget.dining, 'wants', '🍽️')
  add('Entertainment', budget.entertainment, 'wants', '🎬')
  add('Shopping', budget.shopping, 'wants', '🛍️')
  add('Subscriptions', budget.subscriptions, 'wants', '📱')
  add('Travel', budget.travel, 'wants', '✈️')
  add('Hobbies', budget.hobbies, 'wants', '🎸')
  add('Gifts', budget.gifts, 'wants', '🎁')

  const needsTotal = rows.filter((r) => r.type === 'needs').reduce((a, b) => a + b.amount, 0)
  const wantsTotal = rows.filter((r) => r.type === 'wants').reduce((a, b) => a + b.amount, 0)
  const base = budget.emergencyCoverage === 'full-lifestyle' ? needsTotal + wantsTotal : needsTotal
  const efTarget = base * n(budget.emergencyMonths || '3')
  if (efTarget > 0) rows.push({ name: 'Emergency Fund', amount: Math.round(efTarget / 12), type: 'savings', icon: '🛡️' })
  if (n(budget.iraContrib) > 0) rows.push({ name: 'IRA Contribution', amount: n(budget.iraContrib), type: 'savings', icon: '📈' })

  ;(budget.savingsGoals || []).forEach((g) => {
    if (n(g.amount) > 0 && n(g.months) > 0) {
      rows.push({ name: g.name || 'Savings Goal', amount: Math.round(n(g.amount) / n(g.months)), type: 'savings', icon: '🎯' })
    }
  })

  Object.entries(budget.debts || {}).forEach(([k, d]) => {
    if (n(d?.minPayment) > 0) {
      rows.push({ name: `${DEBT_LABELS[k] || k} payment`, amount: n(d.minPayment), type: 'debt', icon: '💳' })
    }
  })

  return rows
}

/* SHARED UI */
interface TileProps {
  label: string
  sublabel?: string
  icon?: string
  selected: boolean
  onClick: () => void
}

const Tile = ({ label, sublabel, icon, selected, onClick }: TileProps) => (
  <button className={`choice-tile ${selected ? 'selected' : ''}`} onClick={onClick}>
    {icon && <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{icon}</span>}
    <Box sx={{ flex: 1 }}>
      <Typography className={`tile-label ${selected ? 'selected' : ''}`}>{label}</Typography>
      {sublabel && <Typography className="tile-sublabel">{sublabel}</Typography>}
    </Box>
    <div className={`tile-radio ${selected ? 'selected' : ''}`} />
  </button>
)

interface InfoBoxProps {
  children: React.ReactNode
  variant?: 'tip' | 'warn' | 'info'
}

const InfoBox = ({ children, variant = 'info' }: InfoBoxProps) => {
  const icons = { tip: '💡', warn: '⚠️', info: 'ℹ️' }
  return (
    <div className={`info-box ${variant}`}>
      <span style={{ flexShrink: 0 }}>{icons[variant]}</span>
      <span style={{ fontFamily: 'inherit', fontSize: 13 }}>{children}</span>
    </div>
  )
}

const SectionDivider = ({ label }: { label: string }) => (
  <div className="section-divider">
    <div className="section-divider-line" />
    <Typography className="section-divider-label">{label}</Typography>
    <div className="section-divider-line" />
  </div>
)

const MoneyField = ({
  label, value, onChange, hint, suffix,
}: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; suffix?: string
}) => (
  <TextField
    fullWidth
    label={label}
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    helperText={hint}
    InputProps={{
      startAdornment: <InputAdornment position="start">$</InputAdornment>,
      endAdornment: suffix ? <InputAdornment position="end">{suffix}</InputAdornment> : undefined,
    }}
    inputProps={{
      inputMode: 'decimal',
      pattern: '[0-9]*[.]?[0-9]*',
      min: 0,
    }}
    size="small"
    onWheel={(e) => (e.target as HTMLElement).blur()}
  />
)

// Step 1 — Name + Household
const ProfileNameStep = ({
  data, setData, onNext,
}: { data: ProfileData; setData: (d: ProfileData) => void; onNext: () => void }) => {
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!data.firstName.trim() || data.firstName.trim().length < 2) e.firstName = 'Min 2 characters'
    if (!/^[A-Za-z\s'-]+$/.test(data.firstName.trim())) e.firstName = 'Letters only'
    if (!data.lastName.trim() || data.lastName.trim().length < 2) e.lastName = 'Min 2 characters'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  return (
    <>
      <Typography className="onboarding-section-title">Let's get to know you</Typography>
      <Typography className="onboarding-section-sub">This helps us personalize your budget and recommendations.</Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6}>
          <TextField fullWidth label="First name" value={data.firstName}
            onChange={(e) => setData({ ...data, firstName: e.target.value })}
            error={!!errors.firstName} helperText={errors.firstName} size="small" />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField fullWidth label="Last name" value={data.lastName}
            onChange={(e) => setData({ ...data, lastName: e.target.value })}
            error={!!errors.lastName} helperText={errors.lastName} size="small" />
        </Grid>
      </Grid>

      <TextField fullWidth select label="Household size" value={data.household}
        onChange={(e) => setData({ ...data, household: e.target.value })}
        helperText="We'll use this to calibrate estimates" size="small" sx={{ mb: 2 }}>
        {[
          { value: 'just-me',       label: 'Just me' },
          { value: 'couple',        label: 'Me + partner / spouse' },
          { value: 'small-family',  label: 'Small family (1–2 kids)' },
          { value: 'large-family',  label: 'Large family (3+ kids)' },
          { value: 'roommates',     label: 'Living with roommates' },
        ].map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
      </TextField>

      <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155', mb: 1.5 }}>
        Do you financially support any dependents?
      </Typography>
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        {[
          { v: 'y', label: 'Yes', sub: 'Children, elderly parents, or others', icon: '👨‍👩‍👧' },
          { v: 'n', label: 'No dependents', sub: 'Budget is for my household only', icon: '🧑' },
        ].map((o) => (
          <Grid item xs={12} sm={6} key={o.v}>
            <Tile label={o.label} sublabel={o.sub} icon={o.icon}
              selected={data.hasDependents === o.v}
              onClick={() => setData({ ...data, hasDependents: o.v })} />
          </Grid>
        ))}
      </Grid>

      <Button fullWidth variant="contained" className="onboarding-primary-btn" onClick={() => { if (validate()) onNext() }}>
        Continue
      </Button>
    </>
  )
}

// Step 2 — Goals
const ProfileGoalsStep = ({
  data, setData, onNext,
}: { data: ProfileData; setData: (d: ProfileData) => void; onNext: () => void }) => (
  <>
    <Typography className="onboarding-section-title">What are you working toward?</Typography>
    <Typography className="onboarding-section-sub">Select all that apply — we'll prioritize these in your plan.</Typography>

    <Grid container spacing={1.5} sx={{ mb: 2 }}>
      {[
        { v: 'emergency',    label: 'Build an emergency fund',    sub: '3–6 months of expenses saved', icon: '🛡️' },
        { v: 'debt',         label: 'Get out of debt',             sub: 'Pay off loans, cards, or balances', icon: '💳' },
        { v: 'retirement',   label: 'Invest for retirement',       sub: '401k, IRA, and long-term growth', icon: '📈' },
        { v: 'savings-goal', label: 'Save for a specific goal',    sub: 'Vacation, car, home, big purchase', icon: '🎯' },
        { v: 'budget',       label: 'Better day-to-day budgeting', sub: 'Track spending and reduce waste', icon: '📊' },
        { v: 'wealth',       label: 'Build long-term wealth',      sub: 'Investing beyond retirement', icon: '💎' },
      ].map((o) => (
        <Grid item xs={12} sm={6} key={o.v}>
          <Tile label={o.label} sublabel={o.sub} icon={o.icon}
            selected={data.goals.includes(o.v)}
            onClick={() => setData({ ...data, goals: tog(data.goals, o.v) })} />
        </Grid>
      ))}
    </Grid>

    {data.goals.length === 0 && (
      <Box sx={{ mb: 2 }}><InfoBox variant="tip">Select at least one goal to continue.</InfoBox></Box>
    )}

    <Button fullWidth variant="contained" className="onboarding-primary-btn"
      disabled={data.goals.length === 0} onClick={onNext}>
      Continue
    </Button>
  </>
)

// Step 3 — Debt types
const ProfileDebtStep = ({
  data, setData, onNext,
}: { data: ProfileData; setData: (d: ProfileData) => void; onNext: () => void }) => {
  const toggle = (v: string) => {
    if (v === 'none') { setData({ ...data, debtTypes: ['none'] }); return }
    const filtered = data.debtTypes.filter((x) => x !== 'none')
    setData({ ...data, debtTypes: tog(filtered, v) })
  }

  return (
    <>
      <Typography className="onboarding-section-title">Do you carry any debt?</Typography>
      <Typography className="onboarding-section-sub">Select all that apply. You'll enter details later.</Typography>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {[
          { v: 'credit-card', label: 'Credit card debt',    sub: 'Revolving balances you carry month to month', icon: '💳' },
          { v: 'medical',     label: 'Medical debt',         sub: 'Hospital bills or healthcare financing', icon: '🏥' },
          { v: 'auto',        label: 'Auto loan',            sub: 'Car or motorcycle loan', icon: '🚗' },
          { v: 'student',     label: 'Student loans',        sub: 'Federal or private student debt', icon: '🎓' },
          { v: 'personal',    label: 'Personal loan',        sub: 'Unsecured loan from a bank or lender', icon: '🏦' },
          { v: 'bnpl',        label: 'Buy Now, Pay Later',   sub: 'Affirm, Klarna, Afterpay balances', icon: '🛒' },
        ].map((o) => (
          <Grid item xs={12} sm={6} key={o.v}>
            <Tile label={o.label} sublabel={o.sub} icon={o.icon}
              selected={data.debtTypes.includes(o.v)}
              onClick={() => toggle(o.v)} />
          </Grid>
        ))}
      </Grid>

      <SectionDivider label="or" />

      <Box sx={{ mb: 3 }}>
        <Tile label="No debt — I'm debt-free" icon="✨"
          selected={data.debtTypes.includes('none')}
          onClick={() => toggle('none')} />
      </Box>

      <Button fullWidth variant="contained" className="onboarding-primary-btn"
        disabled={data.debtTypes.length === 0} onClick={onNext}>
        Continue
      </Button>
    </>
  )
}

// Step 4 — Housing
const ProfileHomeStep = ({
  data, setData, onNext,
}: { data: ProfileData; setData: (d: ProfileData) => void; onNext: () => void }) => (
  <>
    <Typography className="onboarding-section-title">Where do you live?</Typography>
    <Typography className="onboarding-section-sub">Your housing situation shapes a big part of your budget.</Typography>

    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
      {[
        { v: 'rent',             label: 'I rent',                   sub: 'Apartment, house, or room', icon: '🏠' },
        { v: 'own',              label: 'I own my home',            sub: 'Paying a mortgage or own outright', icon: '🏡' },
        { v: 'live-with-others', label: 'Living with family / friends', sub: 'Little to no housing cost', icon: '👨‍👩‍👧‍👦' },
        { v: 'other',            label: 'Other / transitioning',    sub: 'Between moves, temporary housing', icon: '📦' },
      ].map((o) => (
        <Tile key={o.v} label={o.label} sublabel={o.sub} icon={o.icon}
          selected={data.homeType === o.v}
          onClick={() => setData({ ...data, homeType: o.v })} />
      ))}
    </Box>

    <Button fullWidth variant="contained" className="onboarding-primary-btn"
      disabled={!data.homeType} onClick={onNext}>
      Continue
    </Button>
  </>
)

// Step 5 — Transportation
const ProfileTravelStep = ({
  data, setData, onNext,
}: { data: ProfileData; setData: (d: ProfileData) => void; onNext: () => void }) => (
  <>
    <Typography className="onboarding-section-title">How do you get around?</Typography>
    <Typography className="onboarding-section-sub">Select all that apply.</Typography>

    <Grid container spacing={1.5} sx={{ mb: 3 }}>
      {[
        { v: 'car',       label: 'Car or motorcycle',    sub: 'You own or finance a vehicle', icon: '🚗' },
        { v: 'bike',      label: 'Bike / walk / scooter',sub: 'Human-powered or micro-mobility', icon: '🚲' },
        { v: 'transit',   label: 'Public transit',        sub: 'Bus, subway, light rail', icon: '🚇' },
        { v: 'rideshare', label: 'Rideshare',             sub: 'Uber, Lyft, or taxis', icon: '🚕' },
      ].map((o) => (
        <Grid item xs={12} sm={6} key={o.v}>
          <Tile label={o.label} sublabel={o.sub} icon={o.icon}
            selected={data.transport.includes(o.v)}
            onClick={() => setData({ ...data, transport: tog(data.transport, o.v) })} />
        </Grid>
      ))}
    </Grid>

    <Button fullWidth variant="contained" className="onboarding-primary-btn"
      disabled={data.transport.length === 0} onClick={onNext}>
      Continue
    </Button>
  </>
)

// Step 6 — Income
const IncomeStep = ({
  data, setData, onNext,
}: { data: BudgetData; setData: (d: BudgetData) => void; onNext: () => void }) => {
  const [error, setError] = useState('')
  return (
    <>
      <Typography className="onboarding-section-title">What's your monthly income?</Typography>
      <Typography className="onboarding-section-sub">Enter your take-home pay after taxes and deductions.</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ mb: 2 }}>
        <MoneyField label="Monthly take-home income" value={data.income}
          onChange={(v) => setData({ ...data, income: v })}
          hint="Use your net (after-tax) amount. For variable income, use a conservative average." />
      </Box>

      {n(data.income) > 0 && (
        <Box sx={{ p: 2, borderRadius: 2, background: 'rgba(0,212,170,0.07)', border: '1px solid rgba(0,212,170,0.25)', mb: 2 }}>
          <Typography variant="caption" sx={{ color: '#00A884', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Estimated annual income
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0A2540', mt: 0.5 }}>
            ${(n(data.income) * 12).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </Typography>
        </Box>
      )}

      <TextField fullWidth select label="Income frequency" value={data.incomeFreq}
        onChange={(e) => setData({ ...data, incomeFreq: e.target.value })}
        size="small" sx={{ mb: 3 }}>
        {[
          { value: 'monthly',   label: 'Paid monthly' },
          { value: 'biweekly',  label: 'Paid bi-weekly (every 2 weeks)' },
          { value: 'weekly',    label: 'Paid weekly' },
          { value: 'variable',  label: 'Variable / freelance' },
        ].map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
      </TextField>

      <Button fullWidth variant="contained" className="onboarding-primary-btn"
        onClick={() => { if (!n(data.income)) { setError('Please enter your monthly income'); return } setError(''); onNext() }}>
        Continue
      </Button>
    </>
  )
}

// Step 7 — Housing costs
const NeedsHousingStep = ({
  data, setData, profile, onNext,
}: { data: BudgetData; setData: (d: BudgetData) => void; profile: ProfileData; onNext: () => void }) => {
  const isOwner = profile.homeType === 'own'
  const set = (field: keyof BudgetData) => (v: string) => setData({ ...data, [field]: v })

  return (
    <>
      <Typography className="onboarding-section-title">{isOwner ? 'Housing costs' : 'Rent & housing'}</Typography>
      <Typography className="onboarding-section-sub">Your regular monthly housing expenses.</Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
        {!isOwner && <MoneyField label="Monthly rent" value={data.rent} onChange={set('rent')} hint="Your base monthly rent" />}
        {isOwner && <>
          <MoneyField label="Mortgage payment" value={data.mortgage} onChange={set('mortgage')} hint="Principal + interest" />
          <MoneyField label="Property tax (monthly)" value={data.propertyTax} onChange={set('propertyTax')} hint="Annual ÷ 12" />
          <MoneyField label="Home insurance (monthly)" value={data.homeInsurance} onChange={set('homeInsurance')} />
          <MoneyField label="HOA fees (if applicable)" value={data.hoa} onChange={set('hoa')} />
        </>}
        {!isOwner && <MoneyField label="Renters insurance (monthly)" value={data.rentersInsurance} onChange={set('rentersInsurance')} hint="Usually $10–$20/month" />}
      </Box>

      <Button fullWidth variant="contained" className="onboarding-primary-btn" onClick={onNext}>Continue</Button>
    </>
  )
}

// Step 8 — Utilities + transport
const NeedsUtilsStep = ({
  data, setData, profile, onNext,
}: { data: BudgetData; setData: (d: BudgetData) => void; profile: ProfileData; onNext: () => void }) => {
  const hasCar = profile.transport.includes('car')
  const hasTransit = profile.transport.includes('transit') || profile.transport.includes('rideshare')
  const set = (field: keyof BudgetData) => (v: string) => setData({ ...data, [field]: v })

  return (
    <>
      <Typography className="onboarding-section-title">Utilities & transportation</Typography>
      <Typography className="onboarding-section-sub">Monthly recurring costs for essential services.</Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6}><MoneyField label="Electricity / gas" value={data.utilities} onChange={set('utilities')} /></Grid>
        <Grid item xs={12} sm={6}><MoneyField label="Internet" value={data.internet} onChange={set('internet')} /></Grid>
        <Grid item xs={12} sm={6}><MoneyField label="Phone plan" value={data.phone} onChange={set('phone')} /></Grid>
        <Grid item xs={12} sm={6}><MoneyField label="Water / trash" value={data.water} onChange={set('water')} hint="If not in rent" /></Grid>
      </Grid>

      {hasCar && <>
        <SectionDivider label="Vehicle expenses" />
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={6}><MoneyField label="Car payment" value={data.carPayment} onChange={set('carPayment')} /></Grid>
          <Grid item xs={12} sm={6}><MoneyField label="Auto insurance" value={data.carInsurance} onChange={set('carInsurance')} /></Grid>
          <Grid item xs={12} sm={6}><MoneyField label="Gas / fuel" value={data.gas} onChange={set('gas')} /></Grid>
          <Grid item xs={12} sm={6}><MoneyField label="Parking" value={data.parking} onChange={set('parking')} /></Grid>
        </Grid>
      </>}

      {hasTransit && <>
        <SectionDivider label="Transit & rideshare" />
        <Box sx={{ mb: 2 }}>
          <MoneyField label="Monthly transit / rideshare cost" value={data.transitCost} onChange={set('transitCost')}
            hint="Bus pass, subway card, average Uber spend" />
        </Box>
      </>}

      <Button fullWidth variant="contained" className="onboarding-primary-btn" onClick={onNext}>Continue</Button>
    </>
  )
}

// Step 9 — Other needs
const NeedsOtherStep = ({
  data, setData, onNext,
}: { data: BudgetData; setData: (d: BudgetData) => void; onNext: () => void }) => {
  const set = (field: keyof BudgetData) => (v: string) => setData({ ...data, [field]: v })

  return (
    <>
      <Typography className="onboarding-section-title">Other essential expenses</Typography>
      <Typography className="onboarding-section-sub">Regular costs that keep you healthy and functioning.</Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6}><MoneyField label="Groceries" value={data.groceries} onChange={set('groceries')} /></Grid>
        <Grid item xs={12} sm={6}><MoneyField label="Medical / copays" value={data.medical} onChange={set('medical')} hint="Visits, therapy, etc." /></Grid>
        <Grid item xs={12} sm={6}><MoneyField label="Prescriptions" value={data.prescriptions} onChange={set('prescriptions')} /></Grid>
        <Grid item xs={12} sm={6}><MoneyField label="Personal care" value={data.personalCare} onChange={set('personalCare')} hint="Hair, hygiene, grooming" /></Grid>
        <Grid item xs={12} sm={6}><MoneyField label="Clothing" value={data.clothing} onChange={set('clothing')} hint="Basic necessities" /></Grid>
        <Grid item xs={12} sm={6}><MoneyField label="Childcare / education" value={data.childcare} onChange={set('childcare')} hint="Daycare, tuition, supplies" /></Grid>
      </Grid>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: data.hasPets ? 2 : 3, cursor: 'pointer' }}
        onClick={() => setData({ ...data, hasPets: !data.hasPets, pets: data.hasPets ? '' : data.pets })}>
        <div className={`consent-checkbox ${data.hasPets ? 'checked' : ''}`}>
          {data.hasPets && '✓'}
        </div>
        <Typography variant="body2" sx={{ fontWeight: 500, color: '#334155' }}>🐾 I have pets</Typography>
      </Box>

      {data.hasPets && (
        <Box sx={{ mb: 3 }}>
          <MoneyField label="Pet care (monthly)" value={data.pets} onChange={set('pets')} hint="Food, vet, grooming, daycare" />
        </Box>
      )}

      <Button fullWidth variant="contained" className="onboarding-primary-btn" onClick={onNext}>Continue</Button>
    </>
  )
}

// Step 10 — Wants
const WantsStep = ({
  data, setData, onNext,
}: { data: BudgetData; setData: (d: BudgetData) => void; onNext: () => void }) => {
  const set = (field: keyof BudgetData) => (v: string) => setData({ ...data, [field]: v })
  return (
    <>
      <Typography className="onboarding-section-title">Discretionary spending</Typography>
      <Typography className="onboarding-section-sub">How much do you typically spend on the fun stuff each month?</Typography>

      <Box sx={{ mb: 2 }}><InfoBox variant="tip">Be honest here — underestimating wants is the #1 reason budgets fail.</InfoBox></Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6}><MoneyField label="Takeout & delivery" value={data.takeout} onChange={set('takeout')} /></Grid>
        <Grid item xs={12} sm={6}><MoneyField label="Dining out / bars" value={data.dining} onChange={set('dining')} /></Grid>
        <Grid item xs={12} sm={6}><MoneyField label="Entertainment" value={data.entertainment} onChange={set('entertainment')} hint="Movies, concerts, events" /></Grid>
        <Grid item xs={12} sm={6}><MoneyField label="Shopping / misc" value={data.shopping} onChange={set('shopping')} hint="Amazon, impulse buys" /></Grid>
        <Grid item xs={12} sm={6}><MoneyField label="Subscriptions" value={data.subscriptions} onChange={set('subscriptions')} hint="Netflix, Spotify, gym" /></Grid>
        <Grid item xs={12} sm={6}><MoneyField label="Travel / vacations" value={data.travel} onChange={set('travel')} hint="Annual avg ÷ 12" /></Grid>
        <Grid item xs={12} sm={6}><MoneyField label="Hobbies" value={data.hobbies} onChange={set('hobbies')} /></Grid>
        <Grid item xs={12} sm={6}><MoneyField label="Gifts / donations" value={data.gifts} onChange={set('gifts')} /></Grid>
      </Grid>

      <Button fullWidth variant="contained" className="onboarding-primary-btn" onClick={onNext}>Continue</Button>
    </>
  )
}

// Step 11 — Emergency fund
const EmergencyStep = ({
  data, setData, onNext,
}: { data: BudgetData; setData: (d: BudgetData) => void; onNext: () => void }) => (
  <>
    <Typography className="onboarding-section-title">Emergency fund</Typography>
    <Typography className="onboarding-section-sub">A financial safety net for unexpected expenses.</Typography>

    <TextField fullWidth select label="Months of expenses to cover" value={data.emergencyMonths}
      onChange={(e) => setData({ ...data, emergencyMonths: e.target.value })}
      helperText="3–6 months is the standard recommendation" size="small" sx={{ mb: 3 }}>
      {[
        { value: '1',  label: '1 month — just getting started' },
        { value: '3',  label: '3 months — standard recommendation' },
        { value: '6',  label: '6 months — more security' },
        { value: '12', label: '12 months — maximum security' },
      ].map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
    </TextField>

    <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155', mb: 1.5 }}>
      What should the fund cover?
    </Typography>
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
      {[
        { v: 'needs-only',      label: 'Strictly essential needs',   sub: 'Housing, food, utilities, transport only', icon: '🛡️' },
        { v: 'full-lifestyle',  label: 'Full current lifestyle',      sub: 'Everything including wants and subscriptions', icon: '🏠' },
      ].map((o) => (
        <Tile key={o.v} label={o.label} sublabel={o.sub} icon={o.icon}
          selected={data.emergencyCoverage === o.v}
          onClick={() => setData({ ...data, emergencyCoverage: o.v })} />
      ))}
    </Box>

    <Button fullWidth variant="contained" className="onboarding-primary-btn" onClick={onNext}>Continue</Button>
  </>
)

// Step 12 — Investment accounts
const InvestAcctsStep = ({
  data, setData, onNext,
}: { data: BudgetData; setData: (d: BudgetData) => void; onNext: () => void }) => {
  const has = (v: string) => data.investAccts.includes(v)
  const toggle = (v: string) => {
    if (v === 'none') { setData({ ...data, investAccts: ['none'] }); return }
    const filtered = data.investAccts.filter((x) => x !== 'none')
    setData({ ...data, investAccts: tog(filtered, v) })
  }

  return (
    <>
      <Typography className="onboarding-section-title">Investment accounts</Typography>
      <Typography className="onboarding-section-sub">Tell us about accounts you currently contribute to.</Typography>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {[
          { v: '401k',      label: '401(k) — employer plan', sub: 'Pre-tax retirement savings', icon: '📈' },
          { v: 'roth',      label: 'Roth IRA',               sub: 'After-tax, tax-free growth', icon: '🌱' },
          { v: 'trad',      label: 'Traditional IRA',        sub: 'Pre-tax, taxed on withdrawal', icon: '🏛️' },
          { v: 'brokerage', label: 'Taxable brokerage',      sub: 'General investing account', icon: '💼' },
          { v: 'hsa',       label: 'HSA',                    sub: 'Health Savings Account', icon: '🏥' },
          { v: 'none',      label: "None — I'll start now",  sub: 'Set a savings target below', icon: '🌟' },
        ].map((o) => (
          <Grid item xs={12} sm={6} key={o.v}>
            <Tile label={o.label} sublabel={o.sub} icon={o.icon}
              selected={has(o.v)} onClick={() => toggle(o.v)} />
          </Grid>
        ))}
      </Grid>

      {has('401k') && (
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Your contribution %" type="number" value={data.k401contrib}
              onChange={(e) => setData({ ...data, k401contrib: e.target.value })}
              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
              size="small" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Employer match %" type="number" value={data.k401match}
              onChange={(e) => setData({ ...data, k401match: e.target.value })}
              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
              helperText="% your employer matches" size="small" />
          </Grid>
        </Grid>
      )}

      {(has('roth') || has('trad')) && (
        <Box sx={{ mb: 2 }}>
          <MoneyField label="Monthly IRA contribution" value={data.iraContrib}
            onChange={(v) => setData({ ...data, iraContrib: v })}
            hint="2024 limit: $7,000/yr (~$583/mo)" />
        </Box>
      )}

      <Button fullWidth variant="contained" className="onboarding-primary-btn"
        disabled={data.investAccts.length === 0} onClick={onNext}>
        Continue
      </Button>
    </>
  )
}

// Step 13 — Savings goals
const SavingsGoalsStep = ({
  data, setData, onNext,
}: { data: BudgetData; setData: (d: BudgetData) => void; onNext: () => void }) => {
  const addGoal = () => setData({ ...data, savingsGoals: [...data.savingsGoals, { name: '', amount: '', months: '' }] })
  const updateGoal = (i: number, field: keyof SavingsGoal, val: string) => {
    const goals = [...data.savingsGoals]
    goals[i] = { ...goals[i], [field]: val }
    setData({ ...data, savingsGoals: goals })
  }
  const removeGoal = (i: number) => {
    const goals = [...data.savingsGoals]
    goals.splice(i, 1)
    setData({ ...data, savingsGoals: goals })
  }

  return (
    <>
      <Typography className="onboarding-section-title">Specific savings goals</Typography>
      <Typography className="onboarding-section-sub">Vacations, down payments, a new car — anything you're saving toward.</Typography>

      {data.savingsGoals.length === 0 && (
        <Box sx={{ mb: 2 }}><InfoBox variant="info">No goals yet. Add one below or skip if you don't have any right now.</InfoBox></Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
        {data.savingsGoals.map((g, i) => (
          <div key={i} className="goal-card">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#0A2540' }}>Goal {i + 1}</Typography>
              <IconButton size="small" onClick={() => removeGoal(i)}><Close fontSize="small" /></IconButton>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <TextField fullWidth label="Goal name" placeholder="e.g. Europe trip, down payment…"
                value={g.name} onChange={(e) => updateGoal(i, 'name', e.target.value)} size="small" />
              <Grid container spacing={1.5}>
                <Grid item xs={6}>
                  <MoneyField label="Target amount" value={g.amount} onChange={(v) => updateGoal(i, 'amount', v)} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth label="Timeline" type="number" value={g.months}
                    onChange={(e) => updateGoal(i, 'months', e.target.value)}
                    InputProps={{ endAdornment: <InputAdornment position="end">mo</InputAdornment> }}
                    size="small" />
                </Grid>
              </Grid>
              {n(g.amount) > 0 && n(g.months) > 0 && (
                <Typography className="goal-monthly-hint">
                  → ${(n(g.amount) / n(g.months)).toFixed(2)}/month needed
                </Typography>
              )}
            </Box>
          </div>
        ))}
      </Box>

      <Button className="add-goal-btn" onClick={addGoal} sx={{ mb: 3 }}>+ Add a savings goal</Button>

      <Button fullWidth variant="contained" className="onboarding-primary-btn" onClick={onNext}>
        {data.savingsGoals.length === 0 ? 'Skip — no goals' : 'Continue'}
      </Button>
    </>
  )
}

// Step 14 — Debt details
const DebtsStep = ({
  data, setData, profile, onNext,
}: { data: BudgetData; setData: (d: BudgetData) => void; profile: ProfileData; onNext: () => void }) => {
  const hasDebt = !profile.debtTypes.includes('none') && profile.debtTypes.length > 0
  const updateDebt = (type: string, field: keyof DebtDetail, val: string) => {
    setData({ ...data, debts: { ...data.debts, [type]: { ...(data.debts[type] || {}), [field]: val } } })
  }

  if (!hasDebt) return (
    <>
      <Typography className="onboarding-section-title">Debt payoff plan</Typography>
      <Typography className="onboarding-section-sub">You indicated you're debt-free — great!</Typography>
      <Box sx={{ mb: 3 }}><InfoBox variant="tip">Being debt-free means more income can go toward savings and investments.</InfoBox></Box>
      <Button fullWidth variant="contained" className="onboarding-primary-btn" onClick={onNext}>Continue</Button>
    </>
  )

  return (
    <>
      <Typography className="onboarding-section-title">Debt details</Typography>
      <Typography className="onboarding-section-sub">Enter what you know. We'll use this to recommend a payoff strategy.</Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
        {profile.debtTypes.map((type) => (
          <Paper key={type} className="debt-card" elevation={0}>
            <Typography className="debt-card-title">{DEBT_LABELS[type] || type}</Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={4}><MoneyField label="Balance owed" value={data.debts[type]?.balance || ''} onChange={(v) => updateDebt(type, 'balance', v)} /></Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="Interest rate" type="number" size="small"
                  value={data.debts[type]?.rate || ''}
                  onChange={(e) => updateDebt(type, 'rate', e.target.value)}
                  InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
              </Grid>
              <Grid item xs={12} sm={4}><MoneyField label="Min. payment/mo" value={data.debts[type]?.minPayment || ''} onChange={(v) => updateDebt(type, 'minPayment', v)} /></Grid>
            </Grid>
          </Paper>
        ))}
      </Box>

      <Button fullWidth variant="contained" className="onboarding-primary-btn" onClick={onNext}>
        Continue to budget preview →
      </Button>
    </>
  )
}

// Step 15 — Budget Preview
const BudgetPreviewStep = ({
  profile, budget, onNext,
}: { profile: ProfileData; budget: BudgetData; onNext: () => void }) => {
  const rows = calcBudget(profile, budget)
  const income = n(budget.income)
  const total = rows.reduce((a, b) => a + b.amount, 0)
  const remaining = income - total
  const pct = (amt: number) => (income > 0 ? Math.min(100, Math.round((amt / income) * 100)) : 0)

  const byType = rows.reduce<Record<string, CategoryRow[]>>((acc, row) => {
    if (!acc[row.type]) acc[row.type] = []
    acc[row.type].push(row)
    return acc
  }, {})

  const isDeficit = remaining < 0
  const wantsPct = pct(rows.filter((r) => r.type === 'wants').reduce((a, b) => a + b.amount, 0))

  return (
    <>
      <Typography className="onboarding-section-title">Your budget preview</Typography>
      <Typography className="onboarding-section-sub">Review your plan before connecting your bank.</Typography>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6}>
          <Paper className="preview-summary-card income" elevation={0}>
            <Typography variant="caption" sx={{ color: '#00A884', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>Monthly income</Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#0A2540', mt: 0.5 }}>${income.toLocaleString()}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6}>
          <Paper className={`preview-summary-card ${isDeficit ? 'deficit' : 'surplus'}`} elevation={0}>
            <Typography variant="caption" sx={{ color: isDeficit ? '#EF4444' : '#00A884', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {isDeficit ? 'Over budget' : 'Unallocated'}
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, color: isDeficit ? '#EF4444' : '#00D4AA', mt: 0.5 }}>
              {isDeficit ? '-' : '+'}${Math.abs(remaining).toLocaleString()}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Box sx={{ height: 10, borderRadius: 2, overflow: 'hidden', display: 'flex', mb: 1.5 }}>
        {(['needs', 'wants', 'savings', 'debt'] as const).map((type) => {
          const typeTotal = (byType[type] || []).reduce((a, b) => a + b.amount, 0)
          return <Box key={type} sx={{ width: `${pct(typeTotal)}%`, background: TYPE_COLORS[type], height: '100%', transition: 'width .4s' }} />
        })}
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
        {(['needs', 'wants', 'savings', 'debt'] as const).map((type) => {
          const typeTotal = (byType[type] || []).reduce((a, b) => a + b.amount, 0)
          if (!typeTotal) return null
          return (
            <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: TYPE_COLORS[type], flexShrink: 0 }} />
              <Typography variant="caption" sx={{ color: '#64748B' }}>
                {TYPE_LABELS[type]} — {pct(typeTotal)}%
              </Typography>
            </Box>
          )
        })}
      </Box>

      {(['needs', 'wants', 'savings', 'debt'] as const).map((type) => {
        if (!byType[type]?.length) return null
        return (
          <Box key={type} sx={{ mb: 2.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: TYPE_COLORS[type], textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', mb: 1 }}>
              {TYPE_LABELS[type]}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {byType[type].map((row, i) => (
                <div key={i} className="preview-row">
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{row.icon}</span>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#0A2540' }}>{row.name}</Typography>
                    <div className="preview-bar-track">
                      <div className="preview-bar-fill" style={{ width: `${pct(row.amount)}%`, background: TYPE_COLORS[type] }} />
                    </div>
                  </Box>
                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#0A2540' }}>${row.amount.toLocaleString()}</Typography>
                    <Typography variant="caption" sx={{ color: '#94A3B8' }}>{pct(row.amount)}%</Typography>
                  </Box>
                </div>
              ))}
            </Box>
          </Box>
        )
      })}

      {isDeficit && (
        <Box sx={{ mb: 2 }}>
          <InfoBox variant="warn">
            Your budget exceeds income by ${Math.abs(remaining).toLocaleString()}/month. Consider reducing wants to balance it.
          </InfoBox>
        </Box>
      )}
      {!isDeficit && remaining > 0 && (
        <Box sx={{ mb: 2 }}>
          <InfoBox variant="tip">
            You have ${remaining.toLocaleString()}/month unallocated. Consider putting it toward debt payments or investments.
          </InfoBox>
        </Box>
      )}
      {wantsPct > 30 && (
        <Box sx={{ mb: 2 }}>
          <InfoBox variant="warn">
            Wants are {wantsPct}% of income. The 50/30/20 rule recommends keeping this at or below 30%.
          </InfoBox>
        </Box>
      )}

      <Button fullWidth variant="contained" className="onboarding-primary-btn" onClick={onNext} sx={{ mt: 1 }}>
        Looks good — connect my bank →
      </Button>
    </>
  )
}

/* PLAID MODAL */
type PlaidStep = 'select' | 'login' | 'verify' | 'mfa' | 'accounts'

const PlaidModal = ({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) => {
  const [step, setStep] = useState<PlaidStep>('select')
  const [bank, setBank] = useState<BankOption | null>(null)
  const [username, setUsername] = useState('custom_user')
  const [password, setPassword] = useState('pass_good')
  const [mfa, setMfa] = useState('123456')
  const [loginErr, setLoginErr] = useState('')
  const [mfaErr, setMfaErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [shareAcct, setShareAcct] = useState(true)
  const [shareOwn, setShareOwn] = useState(true)
  const [shareRt, setShareRt] = useState(true)

  const filtered = BANKS.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
  const plaidPct = step === 'select' ? 25 : step === 'login' ? 50 : step === 'mfa' || step === 'verify' ? 75 : 100

  const PlaidHeader = ({ showBack = false }: { showBack?: boolean }) => (
    <div className="plaid-header">
      <div style={{ width: 28 }}>
        {showBack && (
          <button onClick={() => setStep('select')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748B' }}>←</button>
        )}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div className="plaid-logo">⊛ PLAID</div>
        <div className="plaid-progress-track">
          <div className="plaid-progress-fill" style={{ width: `${plaidPct}%` }} />
        </div>
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#94A3B8', width: 28 }}>✕</button>
    </div>
  )

  if (step === 'select') return (
    <div className="plaid-overlay">
      <div className="plaid-card">
        <PlaidHeader />
        <Box sx={{ p: '14px 20px 24px' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#0A2540', textAlign: 'center', mb: 2 }}>Select your institution</Typography>
          <TextField fullWidth placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)}
            size="small" sx={{ mb: 2 }} />
          <div className="bank-grid">
            {filtered.map((b) => (
              <Button key={b.id} className="bank-btn" style={{ background: b.bg }}
                onClick={() => { setBank(b); setStep('login') }}>
                {b.label}
              </Button>
            ))}
          </div>
        </Box>
      </div>
    </div>
  )

  if (step === 'login') return (
    <div className="plaid-overlay">
      <div className="plaid-card">
        <PlaidHeader showBack />
        <Box sx={{ p: '14px 20px 24px' }}>
          <Box sx={{ background: bank?.bg, borderRadius: 2, p: 1.5, textAlign: 'center', fontWeight: 800, fontSize: 14, color: '#fff', mb: 2, whiteSpace: 'pre-wrap' }}>
            {bank?.label}
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#0A2540', textAlign: 'center', mb: 0.5 }}>Log in at {bank?.name}</Typography>
          <Typography variant="body2" sx={{ color: '#64748B', textAlign: 'center', mb: 2 }}>Use sandbox credentials below</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
            <TextField fullWidth label="Username" value={username} onChange={(e) => setUsername(e.target.value)}
              helperText="Sandbox: custom_user" size="small" />
            <TextField fullWidth label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              error={!!loginErr} helperText={loginErr || 'Sandbox: pass_good'} size="small" />
          </Box>
          <Button fullWidth variant="contained" disabled={loading}
            sx={{ background: '#0A2540', borderRadius: 2, fontWeight: 700, textTransform: 'none', py: 1.5 }}
            onClick={() => {
              if (username === 'custom_user' && password === 'pass_good') {
                setLoginErr(''); setLoading(true)
                setTimeout(() => { setLoading(false); setStep('verify') }, 800)
              } else {
                setLoginErr('Invalid — use custom_user / pass_good')
              }
            }}>
            {loading ? 'Logging in…' : 'Continue to login ↗'}
          </Button>
        </Box>
      </div>
    </div>
  )

  if (step === 'verify') return (
    <div className="plaid-overlay">
      <div className="plaid-card">
        <PlaidHeader showBack />
        <Box sx={{ p: '14px 20px 28px' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#0A2540', mb: 0.5 }}>Verify your identity</Typography>
          <Typography variant="body2" sx={{ color: '#64748B', mb: 2.5 }}>How should we get in touch?</Typography>
          <Box sx={{ position: 'relative', border: '1.5px solid #CBD5E1', borderRadius: 2, p: 1.5, mb: 2.5 }}>
            <Typography variant="caption" sx={{ position: 'absolute', top: -9, left: 10, background: '#fff', px: 0.5, color: '#94A3B8' }}>Tell us how</Typography>
            <Typography variant="body2" sx={{ color: '#334155' }}>Mobile</Typography>
          </Box>
          <Button fullWidth variant="contained" sx={{ background: '#457B9D', borderRadius: 2, fontWeight: 700, textTransform: 'none', py: 1.5, mb: 1.5 }}
            onClick={() => setStep('mfa')}>Get code</Button>
          <Typography variant="body2" sx={{ textAlign: 'center', color: '#457B9D', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => setStep('mfa')}>Skip phone number →</Typography>
        </Box>
      </div>
    </div>
  )

  if (step === 'mfa') return (
    <div className="plaid-overlay">
      <div className="plaid-card">
        <PlaidHeader showBack />
        <Box sx={{ p: '14px 20px 28px' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#0A2540', mb: 0.5 }}>Enter your code</Typography>
          <Typography variant="body2" sx={{ color: '#64748B', mb: 2.5 }}>Enter the 6-digit verification code.</Typography>
          <TextField fullWidth label="Verification code" value={mfa} onChange={(e) => setMfa(e.target.value)}
            error={!!mfaErr} helperText={mfaErr || 'Sandbox code: 123456'} size="small" sx={{ mb: 2.5 }} />
          <Button fullWidth variant="contained" disabled={loading}
            sx={{ background: '#457B9D', borderRadius: 2, fontWeight: 700, textTransform: 'none', py: 1.5 }}
            onClick={() => {
              if (mfa === '123456') {
                setMfaErr(''); setLoading(true)
                setTimeout(() => { setLoading(false); setStep('accounts') }, 800)
              } else {
                setMfaErr('Incorrect — use 123456')
              }
            }}>
            {loading ? 'Verifying…' : 'Submit code'}
          </Button>
        </Box>
      </div>
    </div>
  )

  if (step === 'accounts') return (
    <div className="plaid-overlay">
      <div className="plaid-card">
        <PlaidHeader />
        <Box sx={{ p: '14px 20px 28px' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#0A2540', mb: 2 }}>Select account(s) to share</Typography>
          <Box onClick={() => setShareAcct((s) => !s)} sx={{ border: `1.5px solid ${shareAcct ? '#00D4AA' : '#E2E8F0'}`, borderRadius: 2, p: 1.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
            <div className={`consent-checkbox ${shareAcct ? 'checked' : ''}`}>{shareAcct && '✓'}</div>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#0A2540' }}>Primary Checking</Typography>
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#0A2540', mb: 0.5 }}>Financial Assistant will access:</Typography>
          <Typography variant="body2" sx={{ color: '#64748B', mb: 2, lineHeight: 1.6 }}>
            Account Name, Description, Balance, Transactions, Statement Date, Payment Details
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#0A2540', mb: 1.5 }}>Additional information to share:</Typography>
          {[
            { v: shareOwn, set: setShareOwn, label: 'Account holder name(s) & Role(s) — verifies account ownership' },
            { v: shareRt,  set: setShareRt,  label: 'Account & routing number — enables money movement' },
          ].map((item, i) => (
            <Box key={i} onClick={() => item.set((s) => !s)} sx={{ display: 'flex', gap: 1.5, mb: 1.5, cursor: 'pointer', alignItems: 'flex-start' }}>
              <div className={`consent-checkbox ${item.v ? 'checked' : ''}`}>{item.v && '✓'}</div>
              <Typography variant="body2" sx={{ color: '#334155', lineHeight: 1.5 }}>{item.label}</Typography>
            </Box>
          ))}
          <Button fullWidth variant="contained" disabled={loading || !shareAcct}
            sx={{ mt: 2, background: '#00D4AA', color: '#0A2540', borderRadius: 2, fontWeight: 700, textTransform: 'none', py: 1.5 }}
            onClick={() => { setLoading(true); setTimeout(() => { setLoading(false); onSuccess() }, 1000) }}>
            {loading ? 'Connecting…' : 'Connect account'}
          </Button>
        </Box>
      </div>
    </div>
  )

  return null
}

// Step 16 — Connect Bank
const PlaidStep = ({ onNext }: { onNext: () => void }) => {
  const [connected, setConnected] = useState(0)
  const [showPlaid, setShowPlaid] = useState(false)

  return (
    <>
      <Typography className="onboarding-section-title">Connect your bank</Typography>
      <Typography className="onboarding-section-sub">Link your accounts so we can analyze transactions and validate your budget.</Typography>

      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 2, py: 0.75, borderRadius: 10, border: `1px solid ${connected > 0 ? 'rgba(0,212,170,0.3)' : '#E2E8F0'}`, background: connected > 0 ? 'rgba(0,212,170,0.08)' : '#F8FAFC', mb: 2.5 }}>
        <Typography variant="body2" sx={{ color: connected > 0 ? '#00A884' : '#64748B', fontWeight: 600 }}>
          {connected > 0 ? '✓' : '○'} {connected} bank{connected !== 1 ? 's' : ''} connected
        </Typography>
      </Box>

      <Box sx={{ background: 'rgba(69,123,157,0.07)', border: '1px solid rgba(69,123,157,0.25)', borderRadius: 2, p: 1.5, mb: 3, fontSize: 13, color: '#0A2540' }}>
        Sandbox credentials: <strong style={{ fontFamily: 'monospace' }}>custom_user</strong> / <strong style={{ fontFamily: 'monospace' }}>pass_good</strong>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Button fullWidth variant="contained" className="onboarding-primary-btn" onClick={() => setShowPlaid(true)}>
          Link bank account
        </Button>
        <Button fullWidth variant="outlined" disabled={connected === 0}
          sx={{ height: 48, fontWeight: 700, textTransform: 'none', borderRadius: '12px', borderColor: '#0A2540', color: '#0A2540' }}
          onClick={onNext}>
          Continue to dashboard →
        </Button>
        {connected === 0 && (
          <Typography variant="body2" sx={{ textAlign: 'center', color: '#457B9D', cursor: 'pointer', fontWeight: 600 }} onClick={onNext}>
            Skip for now →
          </Typography>
        )}
      </Box>

      {showPlaid && (
        <PlaidModal onClose={() => setShowPlaid(false)} onSuccess={() => { setConnected((c) => c + 1); setShowPlaid(false) }} />
      )}
    </>
  )
}

/* Sidebar */
const Sidebar = ({ currentStep, goTo }: { currentStep: StepId; goTo: (s: StepId) => void }) => {
  const currentIdx = ALL_STEPS.indexOf(currentStep)

  const renderGroup = (label: string, steps: StepId[], labels: Record<string, string>) => (
    <Box key={label}>
      <Typography className="sidebar-group-label">{label}</Typography>
      {steps.map((step, i) => {
        const idx = ALL_STEPS.indexOf(step)
        const state = idx < currentIdx ? 'done' : idx === currentIdx ? 'active' : 'pending'
        return (
          <div key={step} className={`sidebar-item ${state}`} onClick={state === 'done' ? () => goTo(step) : undefined}>
            <div className={`sidebar-step-dot ${state}`}>{state === 'done' ? '✓' : i + 1}</div>
            <Typography className={`sidebar-item-label ${state}`}>{labels[step]}</Typography>
          </div>
        )
      })}
    </Box>
  )

  return (
    <div className="onboarding-sidebar">
      <div className="sidebar-logo">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{ width: 32, height: 32, borderRadius: '9px', background: 'linear-gradient(135deg,#0A2540,#00D4AA)', position: 'relative' }}>
            <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 15, height: 15, background: '#fff', borderRadius: '4px' }} />
          </Box>
          <Typography sx={{ fontWeight: 800, fontSize: 16, background: 'linear-gradient(135deg,#fff,#00D4AA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            FinanceAI
          </Typography>
        </Box>
      </div>
      <div className="sidebar-nav">
        {renderGroup('Profile', PROFILE_STEPS, PROFILE_LABELS)}
        {renderGroup('Budget', BUDGET_STEPS, BUDGET_LABELS)}
        <Box>
          <Typography className="sidebar-group-label">Finish</Typography>
          {(['preview', 'plaid'] as StepId[]).map((step) => {
            const idx = ALL_STEPS.indexOf(step)
            const state = idx < currentIdx ? 'done' : idx === currentIdx ? 'active' : 'pending'
            const label = step === 'preview' ? 'Budget Preview' : 'Connect Bank'
            return (
              <div key={step} className={`sidebar-item ${state}`} onClick={state === 'done' ? () => goTo(step) : undefined}>
                <div className={`sidebar-step-dot ${state}`}>{state === 'done' ? '✓' : '✦'}</div>
                <Typography className={`sidebar-item-label ${state}`}>{label}</Typography>
              </div>
            )
          })}
        </Box>
      </div>
    </div>
  )
}

/* ROOT COMPONENT */
function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState<StepId>('profile-name')

  // ✅ Uses lazy initializer — reads & clears sessionStorage once on mount
  const [profile, setProfile] = useState<ProfileData>(getInitialProfile)
  const [budget, setBudget] = useState<BudgetData>(defaultBudget)

  const currentIdx = ALL_STEPS.indexOf(step)
  const progress = Math.round(((currentIdx + 1) / ALL_STEPS.length) * 100)

  const next = () => {
    const nextStep = ALL_STEPS[currentIdx + 1]
    if (nextStep) setStep(nextStep)
    else navigate('/dashboard')
  }

  const back = () => {
    const prevStep = ALL_STEPS[currentIdx - 1]
    if (prevStep) setStep(prevStep)
  }

  const stepContent: Record<StepId, React.ReactNode> = {
    'profile-name':  <ProfileNameStep  data={profile} setData={setProfile} onNext={next} />,
    'profile-goals': <ProfileGoalsStep data={profile} setData={setProfile} onNext={next} />,
    'profile-debt':  <ProfileDebtStep  data={profile} setData={setProfile} onNext={next} />,
    'profile-home':  <ProfileHomeStep  data={profile} setData={setProfile} onNext={next} />,
    'profile-travel':<ProfileTravelStep data={profile} setData={setProfile} onNext={next} />,
    income:          <IncomeStep        data={budget}  setData={setBudget}  onNext={next} />,
    'needs-housing': <NeedsHousingStep  data={budget}  setData={setBudget}  profile={profile} onNext={next} />,
    'needs-utils':   <NeedsUtilsStep    data={budget}  setData={setBudget}  profile={profile} onNext={next} />,
    'needs-other':   <NeedsOtherStep    data={budget}  setData={setBudget}  onNext={next} />,
    wants:           <WantsStep         data={budget}  setData={setBudget}  onNext={next} />,
    emergency:       <EmergencyStep     data={budget}  setData={setBudget}  onNext={next} />,
    'invest-accts':  <InvestAcctsStep   data={budget}  setData={setBudget}  onNext={next} />,
    'savings-goals': <SavingsGoalsStep  data={budget}  setData={setBudget}  onNext={next} />,
    debts:           <DebtsStep         data={budget}  setData={setBudget}  profile={profile} onNext={next} />,
    preview:         <BudgetPreviewStep profile={profile} budget={budget} onNext={next} />,
    plaid:           <PlaidStep         onNext={() => navigate('/dashboard')} />,
  }

  return (
    <div className="onboarding-root">
      <div className="onboarding-background">
        <Box className="gradient-orb orb-1" />
        <Box className="gradient-orb orb-2" />
        <Box className="gradient-orb orb-3" />
      </div>

      <Sidebar currentStep={step} goTo={setStep} />

      <main className="onboarding-main">
        <Container maxWidth={false} disableGutters sx={{ maxWidth: 600, width: '100%' }}>
          {/* Progress */}
          <div className="onboarding-progress-wrap">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#00D4AA', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {PROFILE_STEPS.includes(step) ? 'Profile' : BUDGET_STEPS.includes(step) ? 'Budget' : step === 'preview' ? 'Preview' : 'Connect Bank'}
              </Typography>
              <Typography variant="caption" sx={{ color: '#94A3B8' }}>{progress}% complete</Typography>
            </Box>
            <div className="onboarding-progress-track">
              <div className="onboarding-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <Paper className="onboarding-card" elevation={0}>
            {currentIdx > 0 && (
              <Button className="back-btn" onClick={back}>← Back</Button>
            )}
            {stepContent[step]}
          </Paper>
        </Container>
      </main>
    </div>
  )
}

export default Onboarding