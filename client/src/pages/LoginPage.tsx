import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import './LoginPage.css'

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/link-bank')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* Background orbs */}
      <div className="login-page__bg" aria-hidden="true">
        <div className="login-page__orb login-page__orb--1" />
        <div className="login-page__orb login-page__orb--2" />
      </div>

      <div className="login-page__card">
        {/* Logo */}
        <Link to="/" className="login-page__logo" aria-label="FinanceAI home">
          <span className="login-page__logo-icon" aria-hidden="true" />
          <span className="login-page__logo-text">FinanceAI</span>
        </Link>

        <h1 className="login-page__heading">Welcome back</h1>
        <p className="login-page__sub">Sign in to your account to continue</p>

        <form className="login-page__form" onSubmit={handleSubmit} noValidate>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <div className="login-page__pw-wrap">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="login-page__pw-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <div className="login-page__forgot">
            <Link to="/forgot-password" className="login-page__forgot-link">
              Forgot password?
            </Link>
          </div>

          {error && <p className="login-page__error" role="alert">{error}</p>}

          <Button type="submit" variant="cta" fullWidth disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="login-page__footer">
          Don't have an account?{' '}
          <Link to="/signup">Create one</Link>
        </p>
      </div>
    </div>
  )
}