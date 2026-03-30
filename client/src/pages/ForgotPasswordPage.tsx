import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import './ForgotPasswordPage.css'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('Please enter your email address')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/auth/forgot-password', { email: email.trim() })
      setSubmitted(true)
    } catch {
      // Server always returns 200 to prevent email enumeration, but handle
      // network failures gracefully so the user isn't left hanging.
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="forgot-pw-page">
      <div className="forgot-pw-page__hero">
        <div className="forgot-pw-page__hero-content">
          <h1 className="forgot-pw-page__hero-title">Financial Assistant</h1>
          <p className="forgot-pw-page__hero-sub">
            Don't worry — it happens to the best of us. We'll get you back in.
          </p>
        </div>
      </div>

      <div className="forgot-pw-page__form-side">
        <div className="forgot-pw-page__form-box">
          {submitted ? (
            <>
              <div className="forgot-pw-page__success-icon">
                <CheckCircle size={48} />
              </div>
              <h2 className="forgot-pw-page__heading">Check your email</h2>
              <p className="forgot-pw-page__sub">
                If an account exists for <strong>{email}</strong>, you'll receive a
                password reset link shortly. The link expires in 60 minutes.
              </p>
              <p className="forgot-pw-page__hint">
                Didn't get it? Check your spam folder or try again with a different address.
              </p>
              <Button variant="secondary" fullWidth onClick={() => setSubmitted(false)}>
                Try another email
              </Button>
              <p className="forgot-pw-page__footer">
                <Link to="/login">
                  <ArrowLeft size={14} className="forgot-pw-page__back-icon" />
                  Back to sign in
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="forgot-pw-page__icon-wrap">
                <Mail size={32} />
              </div>
              <h2 className="forgot-pw-page__heading">Forgot your password?</h2>
              <p className="forgot-pw-page__sub">
                Enter the email address you signed up with and we'll send you a link
                to reset your password.
              </p>

              <form className="forgot-pw-page__form" onSubmit={handleSubmit} noValidate>
                <Input
                  label="Email address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />

                {error && <p className="forgot-pw-page__error" role="alert">{error}</p>}

                <Button type="submit" variant="cta" fullWidth disabled={loading}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </Button>
              </form>

              <p className="forgot-pw-page__footer">
                <Link to="/login">
                  <ArrowLeft size={14} className="forgot-pw-page__back-icon" />
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