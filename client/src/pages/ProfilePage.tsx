import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import Card from '../components/ui/Card'
import Avatar from '../components/ui/Avatar'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import EmptyState from '../components/ui/EmptyState'
import {
  Building2,
  CreditCard,
  Landmark,
  TrendingUp,
  Wallet,
  KeyRound,
  AlertTriangle,
  Eye,
  EyeOff,
  CheckCircle2,
  Check,
  X,
} from 'lucide-react'
import './ProfilePage.css'

/* ── Types ── */

interface Account {
  plaidAccountId: string
  name: string
  officialName: string | null
  mask: string | null
  type: string
  subtype: string | null
  currentBalance: number | null
  availableBalance: number | null
  isoCurrencyCode: string | null
}

/* ── Password rules (shared logic with SignUp) ── */

interface PwRule {
  label: string
  test: (pw: string, confirm: string) => boolean
}

const PW_RULES: PwRule[] = [
  { label: 'At least 10 characters',  test: (pw) => pw.length >= 10 },
  { label: 'One uppercase letter',    test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter',    test: (pw) => /[a-z]/.test(pw) },
  { label: 'One number',              test: (pw) => /\d/.test(pw) },
  { label: 'One special character',   test: (pw) => /[^A-Za-z0-9]/.test(pw) },
  { label: 'Passwords match',         test: (pw, c) => pw.length > 0 && c.length > 0 && pw === c },
]

function allRulesPass(pw: string, confirm: string): boolean {
  return PW_RULES.every((r) => r.test(pw, confirm))
}

/* ── Helpers ── */

function accountIcon(type: string) {
  switch (type) {
    case 'credit':     return <CreditCard size={18} />
    case 'investment': return <TrendingUp size={18} />
    case 'loan':       return <Landmark size={18} />
    case 'depository': return <Wallet size={18} />
    default:           return <Building2 size={18} />
  }
}

function formatBalance(amount: number | null, currency: string | null) {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency ?? 'USD',
  }).format(amount)
}

/* ── Component ── */

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { data: accountsData } = useApi<{ accounts: Account[] }>('/api/accounts')

  /* Change Password state */
  const [pwForm, setPwForm] = useState({ current: '', new: '', confirm: '' })
  const [pwShow, setPwShow] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  /* Delete Account state */
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'password'>('idle')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  if (!user) return null

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
  const accounts = accountsData?.accounts ?? []

  const showPwChecklist = pwForm.new.length > 0 || pwForm.confirm.length > 0

  /* ── Change Password handler ── */
  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setPwError('')
    setPwSuccess(false)

    if (!allRulesPass(pwForm.new, pwForm.confirm)) {
      setPwError('Password does not meet all requirements')
      return
    }
    if (pwForm.current === pwForm.new) {
      setPwError('New password must be different from current')
      return
    }

    setPwLoading(true)
    try {
      await api.patch('/api/auth/profile/password', {
        currentPassword: pwForm.current,
        newPassword: pwForm.new,
        confirmNewPassword: pwForm.confirm,
      })
      setPwSuccess(true)
      setPwForm({ current: '', new: '', confirm: '' })
      setTimeout(() => { logout(); navigate('/login') }, 2000)
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setPwLoading(false)
    }
  }

  /* ── Delete Account handler ── */
  async function handleDeleteAccount(e: FormEvent) {
    e.preventDefault()
    setDeleteError('')

    if (!deletePassword) { setDeleteError('Password is required'); return }

    setDeleteLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/auth/account`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ currentPassword: deletePassword }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to delete account')
      }
      logout()
      navigate('/')
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="profile-page page">

      {/* ── User Info ── */}
      <Card className="profile-page__info">
        <div className="profile-page__avatar-row">
          <Avatar name={displayName} size="lg" />
          <div>
            <h3 className="profile-page__name">{displayName}</h3>
            <p className="profile-page__email">{user.email}</p>
          </div>
        </div>

        <div className="profile-page__fields">
          {user.firstName && (
            <div className="profile-page__field">
              <span className="profile-page__field-label">First name</span>
              <span className="profile-page__field-value">{user.firstName}</span>
            </div>
          )}
          {user.lastName && (
            <div className="profile-page__field">
              <span className="profile-page__field-label">Last name</span>
              <span className="profile-page__field-value">{user.lastName}</span>
            </div>
          )}
          <div className="profile-page__field">
            <span className="profile-page__field-label">Email</span>
            <span className="profile-page__field-value">{user.email}</span>
          </div>
          {user.createdAt && (
            <div className="profile-page__field">
              <span className="profile-page__field-label">Member since</span>
              <span className="profile-page__field-value">
                {new Date(user.createdAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* ── Linked Accounts ── */}
      <Card>
        <h4 className="profile-page__section-title">Linked Accounts</h4>
        {accounts.length > 0 ? (
          <div className="profile-page__accounts">
            {accounts.map((acct) => (
              <div key={acct.plaidAccountId} className="profile-page__account-row">
                <div className="profile-page__account-icon">
                  {accountIcon(acct.type)}
                </div>
                <div className="profile-page__account-info">
                  <span className="profile-page__account-name">
                    {acct.officialName ?? acct.name}
                    {acct.mask && <span className="profile-page__account-mask"> ···{acct.mask}</span>}
                  </span>
                  <span className="profile-page__account-sub">
                    {acct.subtype ?? acct.type}
                  </span>
                </div>
                <span className="profile-page__account-balance">
                  {formatBalance(acct.currentBalance, acct.isoCurrencyCode)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Building2 size={24} />}
            title="No linked accounts yet"
            description="Connect your bank via the setup flow to see your linked accounts here."
          />
        )}
      </Card>

      {/* ── Change Password ── */}
      <Card>
        <div className="profile-page__section-header">
          <KeyRound size={20} />
          <h4 className="profile-page__section-title">Change Password</h4>
        </div>

        {pwSuccess ? (
          <div className="profile-page__success">
            <CheckCircle2 size={20} />
            <div>
              <strong>Password changed successfully.</strong>
              <p>All sessions have been invalidated. Redirecting to login…</p>
            </div>
          </div>
        ) : (
          <form className="profile-page__pw-form" onSubmit={handleChangePassword} noValidate>
            <div className="profile-page__pw-field">
              <Input
                label="Current password"
                type={pwShow ? 'text' : 'password'}
                value={pwForm.current}
                onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))}
                autoComplete="current-password"
                required
              />
            </div>

            <div className="profile-page__pw-field">
              <Input
                label="New password"
                type={pwShow ? 'text' : 'password'}
                value={pwForm.new}
                onChange={(e) => setPwForm((p) => ({ ...p, new: e.target.value }))}
                autoComplete="new-password"
                required
              />
            </div>

            <div className="profile-page__pw-field">
              <Input
                label="Confirm new password"
                type={pwShow ? 'text' : 'password'}
                value={pwForm.confirm}
                onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
                autoComplete="new-password"
                required
              />
            </div>

            <button
              type="button"
              className="profile-page__pw-show"
              onClick={() => setPwShow((v) => !v)}
            >
              {pwShow ? <EyeOff size={14} /> : <Eye size={14} />}
              {pwShow ? 'Hide passwords' : 'Show passwords'}
            </button>

            {/* Live password checklist — same design as SignUp */}
            {showPwChecklist && (
              <ul className="pw-checklist">
                {PW_RULES.map((rule) => {
                  const passed = rule.test(pwForm.new, pwForm.confirm)
                  return (
                    <li
                      key={rule.label}
                      className={`pw-checklist__rule ${passed ? 'pw-checklist__rule--pass' : ''}`}
                    >
                      {passed ? <Check size={14} /> : <X size={14} />}
                      {rule.label}
                    </li>
                  )
                })}
              </ul>
            )}

            {pwError && <p className="profile-page__error" role="alert">{pwError}</p>}

            <div className="profile-page__pw-actions">
              <Button type="submit" variant="primary" size="sm" disabled={pwLoading}>
                {pwLoading ? 'Updating…' : 'Update password'}
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* ── Danger Zone — Delete Account ── */}
      <Card className="profile-page__danger-card">
        <div className="profile-page__section-header">
          <AlertTriangle size={20} className="profile-page__danger-icon" />
          <h4 className="profile-page__section-title profile-page__section-title--danger">
            Danger Zone
          </h4>
        </div>

        {deleteStep === 'idle' && (
          <div className="profile-page__danger-content">
            <div className="profile-page__danger-text">
              <strong>Delete your account</strong>
              <p>
                Permanently remove your account and all associated data including transactions,
                budgets, linked accounts, and proposals. This action cannot be undone.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setDeleteStep('confirm')}
            >
              Delete account
            </Button>
          </div>
        )}

        {deleteStep === 'confirm' && (
          <div className="profile-page__danger-confirm">
            <div className="profile-page__danger-warning">
              <AlertTriangle size={18} />
              <p>
                <strong>Are you sure?</strong> This will permanently delete all of your data:
                transactions, budgets, bank connections, proposals, and your user account.
                You will not be able to recover any of this data.
              </p>
            </div>
            <div className="profile-page__danger-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setDeleteStep('idle'); setDeleteError('') }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setDeleteStep('password')}
              >
                Yes, I want to delete my account
              </Button>
            </div>
          </div>
        )}

        {deleteStep === 'password' && (
          <form className="profile-page__danger-form" onSubmit={handleDeleteAccount} noValidate>
            <p className="profile-page__danger-prompt">
              Enter your password to confirm account deletion.
            </p>
            <Input
              label="Password"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {deleteError && <p className="profile-page__error" role="alert">{deleteError}</p>}
            <div className="profile-page__danger-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setDeleteStep('idle'); setDeletePassword(''); setDeleteError('') }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="danger" size="sm" disabled={deleteLoading}>
                {deleteLoading ? 'Deleting…' : 'Permanently delete my account'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}