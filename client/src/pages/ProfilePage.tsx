import { useState, FormEvent, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import Card from '../components/ui/Card'
import Avatar from '../components/ui/Avatar'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import ProgressBar from '../components/ui/ProgressBar'
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

function getPasswordStrength(pw: string): number {
  let score = 0
  if (pw.length >= 10) score += 20
  if (/[A-Z]/.test(pw)) score += 20
  if (/[a-z]/.test(pw)) score += 20
  if (/\d/.test(pw)) score += 20
  if (/[^A-Za-z0-9]/.test(pw)) score += 20
  return score
}

function strengthLabel(score: number): string {
  if (score <= 20) return 'Weak'
  if (score <= 40) return 'Fair'
  if (score <= 60) return 'Moderate'
  if (score <= 80) return 'Good'
  return 'Strong'
}

function strengthColor(score: number): string {
  if (score <= 20) return 'var(--color-danger)'
  if (score <= 40) return 'var(--color-warning)'
  if (score <= 60) return 'var(--color-warning)'
  if (score <= 80) return 'var(--color-success)'
  return 'var(--color-success)'
}

function validatePassword(pw: string): string | null {
  if (pw.length < 10) return 'Password must be at least 10 characters'
  if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter'
  if (!/[a-z]/.test(pw)) return 'Password must contain a lowercase letter'
  if (!/\d/.test(pw)) return 'Password must contain a number'
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain a special character'
  return null
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { data: accountsData } = useApi<{ accounts: Account[] }>('/api/accounts')

  // ── Edit name state
  const [editingName, setEditingName] = useState(false)
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameError, setNameError] = useState('')
  const [nameSuccess, setNameSuccess] = useState('')

  // ── Change email state
  const [editingEmail, setEditingEmail] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [emailSuccess, setEmailSuccess] = useState('')

  // ── Change password state
  const [showPwForm, setShowPwForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  // ── Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  if (!user) return null

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleNameSave = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    setNameError('')
    setNameSuccess('')
    setNameLoading(true)
    try {
      await api.patch('/api/auth/profile/name', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })
      setNameSuccess('Name updated')
      setEditingName(false)
      setTimeout(() => setNameSuccess(''), 3000)
    } catch (err: unknown) {
      setNameError(err instanceof Error ? err.message : 'Failed to update name')
    } finally {
      setNameLoading(false)
    }
  }, [firstName, lastName])

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
      // Server revokes all sessions on password change — clear tokens and redirect
      await logout()
      navigate('/login')
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
      await api.delete('/api/auth/account', { currentPassword: deletePassword })
      await logout()
      navigate('/')
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="profile-page page">


      {/* ── User Info Card ──────────────────────────────────────────────── */}
      <Card className="profile-page__info">
        <div className="profile-page__avatar-row">
          <Avatar name={displayName} size="lg" />
          <div>
            <h3 className="profile-page__name">{displayName}</h3>
            <p className="profile-page__email">{user.email}</p>
          </div>
        </div>

        <div className="profile-page__fields">
          {/* Name */}
          <div className="profile-page__field">
            <span className="profile-page__field-label">Name</span>
            {editingName ? (
              <form className="profile-page__inline-form" onSubmit={handleNameSave}>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First"
                />
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last"
                />
                <div className="profile-page__inline-actions">
                  <Button type="submit" variant="primary" size="sm" disabled={nameLoading}>
                    {nameLoading ? 'Saving…' : 'Save'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingName(false)
                      setFirstName(user?.firstName ?? '')
                      setLastName(user?.lastName ?? '')
                      setNameError('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                {nameError && <p className="profile-page__field-error">{nameError}</p>}
              </form>
            ) : (
              <div className="profile-page__field-row">
                <span className="profile-page__field-value">
                  {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}
                </span>
                <button
                  className="profile-page__edit-btn"
                  onClick={() => setEditingName(true)}
                  aria-label="Edit name"
                >
                  <Pencil size={14} />
                </button>
              </div>
            )}
          </div>
          {nameSuccess && <p className="profile-page__field-success">{nameSuccess}</p>}

          {/* Email */}
          <div className="profile-page__field">
            <span className="profile-page__field-label">Email</span>
            {editingEmail ? (
              <form className="profile-page__inline-form" onSubmit={handleEmailSave}>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new@email.com"
                  autoComplete="email"
                />
                <div className="profile-page__inline-actions">
                  <Button type="submit" variant="primary" size="sm" disabled={emailLoading}>
                    {emailLoading ? 'Sending…' : 'Verify new email'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingEmail(false)
                      setNewEmail('')
                      setEmailError('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                {emailError && <p className="profile-page__field-error">{emailError}</p>}
              </form>
            ) : (
              <div className="profile-page__field-row">
                <span className="profile-page__field-value">{user.email}</span>
                <button
                  className="profile-page__edit-btn"
                  onClick={() => setEditingEmail(true)}
                  aria-label="Change email"
                >
                  <Pencil size={14} />
                </button>
              </div>
            )}
          </div>
          {emailSuccess && <p className="profile-page__field-success">{emailSuccess}</p>}

          {/* Member since */}
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

<<<<<<< HEAD
      {/* ── Change Password Card ─────────────────────────────────────────── */}
      <Card>
        <div className="profile-page__section-header">
          <h4 className="profile-page__section-title">Password</h4>
          {!showPwForm && (
            <Button variant="secondary" size="sm" onClick={() => setShowPwForm(true)}>
              Change password
            </Button>
          )}
        </div>

        {showPwForm && (
          <form className="profile-page__pw-form" onSubmit={handlePasswordChange} noValidate>
            <div className="profile-page__pw-wrap">
              <Input
                label="Current password"
                type={showCurrentPw ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="profile-page__pw-toggle"
                onClick={() => setShowCurrentPw((v) => !v)}
                aria-label={showCurrentPw ? 'Hide password' : 'Show password'}
              >
                {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <div className="profile-page__pw-group">
              <div className="profile-page__pw-wrap">
                <Input
                  label="New password"
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="profile-page__pw-toggle"
                  onClick={() => setShowNewPw((v) => !v)}
                  aria-label={showNewPw ? 'Hide password' : 'Show password'}
                >
                  {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {newPassword.length > 0 && (
                <div className="profile-page__pw-strength">
                  <ProgressBar value={strength} color={strengthColor(strength)} />
                  <span
                    className="profile-page__pw-strength-label"
                    style={{ color: strengthColor(strength) }}
                  >
                    {strengthLabel(strength)}
                  </span>
                </div>
              )}
            </div>

            <Input
              label="Confirm new password"
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />

            {pwError && <p className="profile-page__field-error" role="alert">{pwError}</p>}

            <div className="profile-page__pw-actions">
              <Button type="submit" variant="cta" disabled={pwLoading}>
                {pwLoading ? 'Updating…' : 'Update password'}
              </Button>
              <Button type="button" variant="ghost" onClick={resetPwForm}>
                Cancel
              </Button>
            </div>

            <p className="profile-page__pw-note">
              You'll be signed out of all devices after changing your password.
            </p>
          </form>
        )}
      </Card>

      {/* ── Linked Accounts Card ─────────────────────────────────────────── */}
=======
      {/* ── Linked Accounts ── */}
>>>>>>> c62ef6e (Created devMock for testing, changed dashboard to have better design and incorporate light and dark)
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

<<<<<<< HEAD
      {/* ── Danger Zone Card ─────────────────────────────────────────────── */}
      <Card className="profile-page__danger-card">
        <h4 className="profile-page__section-title profile-page__section-title--danger">
          Danger Zone
        </h4>
        <p className="profile-page__danger-desc">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
          Delete account
        </Button>
      </Card>

      {/* ── Delete Account Modal ─────────────────────────────────────────── */}
      <Modal isOpen={showDeleteModal} onClose={resetDeleteModal} title="Delete your account">
        <div className="profile-page__delete-modal">
          <div className="profile-page__delete-warning">
            <AlertTriangle size={20} />
            <p>
              This will permanently delete your account, budget, transactions,
              linked bank accounts, and all proposals. This cannot be reversed.
            </p>
          </div>

          <Input
            label="Enter your password to confirm"
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            autoComplete="current-password"
          />

          {deleteError && <p className="profile-page__field-error" role="alert">{deleteError}</p>}

          <div className="profile-page__delete-actions">
            <Button
              variant="danger"
              fullWidth
              onClick={handleDeleteAccount}
              disabled={deleteLoading || !deletePassword}
            >
              {deleteLoading ? 'Deleting…' : 'Permanently delete my account'}
            </Button>
            <Button variant="ghost" fullWidth onClick={resetDeleteModal}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
=======
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