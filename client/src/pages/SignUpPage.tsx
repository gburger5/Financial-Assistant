import { FormEvent, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import ProgressBar from '../components/ui/ProgressBar'
import './SignUpPage.css'

// Matching onboard-execution.md spec: length + uppercase + lowercase + digit
function getPasswordStrength(pw: string): number {
  let score = 0
  if (pw.length >= 10) score += 25
  if (/[A-Z]/.test(pw)) score += 25
  if (/[a-z]/.test(pw)) score += 25
  if (/\d/.test(pw)) score += 25
  return score
}

function strengthLabel(score: number): string {
  if (score <= 25) return 'Weak'
  if (score <= 50) return 'Fair'
  if (score <= 75) return 'Good'
  return 'Strong'
}

function strengthColor(score: number): string {
  if (score <= 25) return 'var(--color-danger)'
  if (score <= 50) return 'var(--color-warning)'
  if (score <= 75) return 'var(--color-success)'
  return 'var(--color-success)'
}

function validatePassword(pw: string): string | null {
  if (pw.length < 10) return 'Password must be at least 10 characters'
  if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter'
  if (!/[a-z]/.test(pw)) return 'Password must contain a lowercase letter'
  if (!/\d/.test(pw)) return 'Password must contain a number'
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

    // Client-side validation before hitting the API
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
      // Auto-login after registration
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
      <div className="signup-page__hero">
        <div className="signup-page__hero-content">
          <h1 className="signup-page__hero-title">Financial Assistant</h1>
          <p className="signup-page__hero-sub">
            Connect your accounts. Get personalized budget insights powered by AI.
          </p>
        </div>
      </div>

      <div className="signup-page__form-side">
        <div className="signup-page__form-box">
          <h2 className="signup-page__heading">Create account</h2>
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
    </div>
  )
}
