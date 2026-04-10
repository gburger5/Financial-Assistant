import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Mail, ArrowLeft } from 'lucide-react'
import { api } from '../services/api'
import Button from '../components/ui/Button'
import './CheckEmailPage.css'

export default function CheckEmailPage() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [error, setError] = useState('')

  async function handleResend() {
    if (!email) return
    setResending(true)
    setError('')
    setResent(false)
    try {
      await api.post('/api/auth/resend-verification', { email })
      setResent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resend email')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="check-email-page">
      <div className="check-email-page__bg" aria-hidden="true">
        <div className="check-email-page__orb check-email-page__orb--1" />
        <div className="check-email-page__orb check-email-page__orb--2" />
      </div>

      <div className="check-email-page__card">
        <Link to="/" className="check-email-page__logo" aria-label="FinanceAI home">
          <span className="check-email-page__logo-icon" aria-hidden="true" />
          <span className="check-email-page__logo-text">FinanceAI</span>
        </Link>

        <div className="check-email-page__icon-wrap">
          <Mail size={32} />
        </div>

        <h1 className="check-email-page__heading">Check your email</h1>
        <p className="check-email-page__sub">
          We sent a verification link to{' '}
          {email ? <strong>{email}</strong> : 'your email address'}.
          Click the link in the email to verify your account.
        </p>

        {error && <p className="check-email-page__error" role="alert">{error}</p>}
        {resent && <p className="check-email-page__success" role="status">Verification email sent!</p>}

        {email && (
          <Button
            variant="secondary"
            fullWidth
            disabled={resending || resent}
            onClick={handleResend}
          >
            {resending ? 'Sending…' : resent ? 'Email sent!' : 'Resend verification email'}
          </Button>
        )}

        <p className="check-email-page__footer">
          <Link to="/login">
            <ArrowLeft size={14} className="check-email-page__back-icon" />
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}