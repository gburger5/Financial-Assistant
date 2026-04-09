import { FormEvent, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Check, X } from 'lucide-react'
import { api } from '../services/api'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import './SignUpPage.css'

/* ── Password rules ─────────────────────────────────────── */

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

/* ── Component ─────────────────────────────────────────── */

export default function SignUpPage() {
  const navigate = useNavigate()
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

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!allRulesPass(form.password, form.confirmPassword)) {
      setError('Password does not meet all requirements')
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
      navigate(`/check-email?email=${encodeURIComponent(form.email)}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const showChecklist = form.password.length > 0 || form.confirmPassword.length > 0

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

          <Input
            label="Confirm password"
            type={showPassword ? 'text' : 'password'}
            value={form.confirmPassword}
            onChange={(e) => update('confirmPassword', e.target.value)}
            required
          />

          {/* Live password checklist — below both password fields */}
          {showChecklist && (
            <ul className="pw-checklist">
              {PW_RULES.map((rule) => {
                const passed = rule.test(form.password, form.confirmPassword)
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