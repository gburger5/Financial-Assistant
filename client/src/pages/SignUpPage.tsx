import { FormEvent, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import ProgressBar from '../components/ui/ProgressBar'
import './SignUpPage.css'

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
  if (score <= 60) return 'Good'
  if (score <= 80) return 'Strong'
  return 'Excellent'
}

function strengthColor(score: number): string {
  if (score <= 20) return '#EF4444'
  if (score <= 40) return '#F59E0B'
  if (score <= 60) return '#F59E0B'
  return '#00A884'
}

function validatePassword(pw: string): string | null {
  if (pw.length < 10) return 'Password must be at least 10 characters'
  if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter'
  if (!/[a-z]/.test(pw)) return 'Password must contain a lowercase letter'
  if (!/\d/.test(pw)) return 'Password must contain a number'
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain a special character'
  return null
}

export default function SignUpPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const strength = getPasswordStrength(form.password)

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    const pwError = validatePassword(form.password)
    if (pwError) { setError(pwError); return }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/auth/register', {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        confirmPassword: form.confirmPassword,
      })
      await login(form.email, form.password)
      navigate('/link-bank')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="signup-page">
      {/* Background orbs */}
      <div className="signup-page__bg" aria-hidden="true">
        <div className="signup-page__orb signup-page__orb--1" />
        <div className="signup-page__orb signup-page__orb--2" />
      </div>

      <div className="signup-page__card">
        {/* Logo */}
        <Link to="/" className="signup-page__logo" aria-label="FinanceAI home">
          <span className="signup-page__logo-icon" aria-hidden="true" />
          <span className="signup-page__logo-text">FinanceAI</span>
        </Link>

        <h1 className="signup-page__heading">Create your account</h1>
        <p className="signup-page__sub">Start managing your finances smarter</p>

        <form className="signup-page__form" onSubmit={handleSubmit} noValidate>
          <div className="signup-page__name-row">
            <Input
              label="First name"
              value={form.firstName}
              onChange={(e) => update('firstName', e.target.value)}
              required
            />
            <Input
              label="Last name"
              value={form.lastName}
              onChange={(e) => update('lastName', e.target.value)}
              required
            />
          </div>

          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            required
          />

          <div className="signup-page__pw-group">
            <div className="signup-page__pw-wrap">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                required
              />
              <button
                type="button"
                className="signup-page__pw-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {form.password.length > 0 && (
              <div className="signup-page__strength">
                <ProgressBar value={strength} color={strengthColor(strength)} />
                <span className="signup-page__strength-label" style={{ color: strengthColor(strength) }}>
                  {strengthLabel(strength)}
                </span>
              </div>
            )}
          </div>

          <Input
            label="Confirm password"
            type="password"
            value={form.confirmPassword}
            onChange={(e) => update('confirmPassword', e.target.value)}
            required
          />

          <p className="signup-page__pw-requirements">
            At least 10 characters with uppercase, lowercase, number, and special character.
          </p>

          {error && <p className="signup-page__error" role="alert">{error}</p>}

          <Button type="submit" variant="cta" fullWidth disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="signup-page__footer">
          Already have an account?{' '}
          <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}