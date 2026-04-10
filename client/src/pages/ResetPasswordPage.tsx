import { FormEvent, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, ArrowLeft, CheckCircle, AlertTriangle, Check, X } from 'lucide-react'
import { api } from '../services/api'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import ProgressBar from '../components/ui/ProgressBar'
import './ResetPasswordPage.css'

/* ── Password validation (matches backend regex) ─────────────────────────── */

interface PwRule {
  label: string
  test: (pw: string) => boolean
}

const PW_RULES: PwRule[] = [
  { label: 'At least 10 characters', test: (pw) => pw.length >= 10 },
  { label: 'One uppercase letter',   test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter',   test: (pw) => /[a-z]/.test(pw) },
  { label: 'One number',             test: (pw) => /\d/.test(pw) },
  { label: 'One special character',  test: (pw) => /[^A-Za-z0-9]/.test(pw) },
]

function getStrengthScore(pw: string): number {
  return PW_RULES.filter((r) => r.test(pw)).length * 20
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
  if (score <= 60) return 'var(--color-warning)'
  return 'var(--color-success)'
}

function validatePassword(pw: string): string | null {
  for (const rule of PW_RULES) {
    if (!rule.test(pw)) return `Password must meet: ${rule.label.toLowerCase()}`
  }
  return null
}

/* ── Component ───────────────────────────────────────────────────────────── */

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const strength = getStrengthScore(newPassword)
  const showChecklist = newPassword.length > 0

  /* ── Missing-token state ───────────────────────────────────────────────── */
  if (!token) {
    return (
      <div className="reset-pw-page">
        <div className="reset-pw-page__bg" aria-hidden="true">
          <div className="reset-pw-page__orb reset-pw-page__orb--1" />
          <div className="reset-pw-page__orb reset-pw-page__orb--2" />
        </div>
        <div className="reset-pw-page__card">
          <Link to="/" className="reset-pw-page__logo" aria-label="FinanceAI home">
            <span className="reset-pw-page__logo-icon" aria-hidden="true" />
            <span className="reset-pw-page__logo-text">FinanceAI</span>
          </Link>
          <div className="reset-pw-page__warn-icon">
            <AlertTriangle size={48} />
          </div>
          <h1 className="reset-pw-page__heading">Invalid reset link</h1>
          <p className="reset-pw-page__sub">
            This link is missing a reset token. It may have been copied
            incorrectly or has already been used.
          </p>
          <Link to="/forgot-password">
            <Button variant="cta" fullWidth>Request a new link</Button>
          </Link>
          <p className="reset-pw-page__footer">
            <Link to="/login">
              <ArrowLeft size={14} className="reset-pw-page__back-icon" />
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    )
  }

  /* ── Submit handler ────────────────────────────────────────────────────── */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    const pwError = validatePassword(newPassword)
    if (pwError) { setError(pwError); return }

    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/auth/reset-password', {
        token,
        newPassword,
        confirmNewPassword,
      })
      setSuccess(true)
      setTimeout(() => navigate('/login'), 4000)
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Reset failed. The link may have expired — request a new one.',
      )
    } finally {
      setLoading(false)
    }
  }

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className="reset-pw-page">
      <div className="reset-pw-page__bg" aria-hidden="true">
        <div className="reset-pw-page__orb reset-pw-page__orb--1" />
        <div className="reset-pw-page__orb reset-pw-page__orb--2" />
      </div>

      <div className="reset-pw-page__card">
        <Link to="/" className="reset-pw-page__logo" aria-label="FinanceAI home">
          <span className="reset-pw-page__logo-icon" aria-hidden="true" />
          <span className="reset-pw-page__logo-text">FinanceAI</span>
        </Link>

        {success ? (
          <>
            <div className="reset-pw-page__success-icon">
              <CheckCircle size={48} />
            </div>
            <h1 className="reset-pw-page__heading">Password reset!</h1>
            <p className="reset-pw-page__sub">
              Your password has been updated and all active sessions have been
              invalidated. Redirecting you to sign in…
            </p>
            <Link to="/login">
              <Button variant="cta" fullWidth>Sign in now</Button>
            </Link>
          </>
        ) : (
          <>
            <h1 className="reset-pw-page__heading">Set a new password</h1>
            <p className="reset-pw-page__sub">
              Choose a strong password you haven't used before.
            </p>

            <form className="reset-pw-page__form" onSubmit={handleSubmit} noValidate>
              <div className="reset-pw-page__pw-group">
                <div className="reset-pw-page__pw-wrap">
                  <Input
                    label="New password"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="reset-pw-page__pw-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {newPassword.length > 0 && (
                  <div className="reset-pw-page__strength">
                    <ProgressBar value={strength} color={strengthColor(strength)} />
                    <span
                      className="reset-pw-page__strength-label"
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

              {/* Live checklist */}
              {showChecklist && (
                <ul className="pw-checklist">
                  {PW_RULES.map((rule) => {
                    const passed = rule.test(newPassword)
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

              {error && <p className="reset-pw-page__error" role="alert">{error}</p>}

              <Button type="submit" variant="cta" fullWidth disabled={loading}>
                {loading ? 'Resetting…' : 'Reset password'}
              </Button>
            </form>

            <p className="reset-pw-page__footer">
              <Link to="/login">
                <ArrowLeft size={14} className="reset-pw-page__back-icon" />
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}