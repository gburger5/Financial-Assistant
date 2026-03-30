import { FormEvent, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react'
import { api } from '../services/api'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import ProgressBar from '../components/ui/ProgressBar'
import './ResetPasswordPage.css'

// ── Password validation (matches updated backend regex) ─────────────────────

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

  const strength = getPasswordStrength(newPassword)

  // If no token in the URL, show an error state instead of the form.
  if (!token) {
    return (
      <div className="reset-pw-page">
        <div className="reset-pw-page__hero">
          <div className="reset-pw-page__hero-content">
            <h1 className="reset-pw-page__hero-title">Financial Assistant</h1>
            <p className="reset-pw-page__hero-sub">
              Secure your account with a new password.
            </p>
          </div>
        </div>
        <div className="reset-pw-page__form-side">
          <div className="reset-pw-page__form-box">
            <div className="reset-pw-page__warn-icon">
              <AlertTriangle size={48} />
            </div>
            <h2 className="reset-pw-page__heading">Invalid reset link</h2>
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
      </div>
    )
  }

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
      // Auto-redirect to login after a short delay
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

  return (
    <div className="reset-pw-page">
      <div className="reset-pw-page__hero">
        <div className="reset-pw-page__hero-content">
          <h1 className="reset-pw-page__hero-title">Financial Assistant</h1>
          <p className="reset-pw-page__hero-sub">
            Secure your account with a new password.
          </p>
        </div>
      </div>

      <div className="reset-pw-page__form-side">
        <div className="reset-pw-page__form-box">
          {success ? (
            <>
              <div className="reset-pw-page__success-icon">
                <CheckCircle size={48} />
              </div>
              <h2 className="reset-pw-page__heading">Password reset!</h2>
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
              <h2 className="reset-pw-page__heading">Set a new password</h2>
              <p className="reset-pw-page__sub">
                Choose a strong password you haven't used before.
              </p>

              <div className="reset-pw-page__requirements">
                <p className="reset-pw-page__req-title">Password requirements:</p>
                <ul className="reset-pw-page__req-list">
                  <li className={newPassword.length >= 10 ? 'met' : ''}>At least 10 characters</li>
                  <li className={/[A-Z]/.test(newPassword) ? 'met' : ''}>One uppercase letter</li>
                  <li className={/[a-z]/.test(newPassword) ? 'met' : ''}>One lowercase letter</li>
                  <li className={/\d/.test(newPassword) ? 'met' : ''}>One number</li>
                  <li className={/[^A-Za-z0-9]/.test(newPassword) ? 'met' : ''}>One special character</li>
                </ul>
              </div>

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
    </div>
  )
}