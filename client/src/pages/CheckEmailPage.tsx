import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
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
      <div className="check-email-page__hero">
        <div className="check-email-page__hero-content">
          <h1 className="check-email-page__hero-title">Financial Assistant</h1>
          <p className="check-email-page__hero-sub">
            Connect your accounts. Get personalized budget insights powered by AI.
          </p>
        </div>
      </div>

      <div className="check-email-page__form-side">
        <div className="check-email-page__box">
          <div className="check-email-page__icon">
            <Mail size={40} />
          </div>
          <h2 className="check-email-page__heading">Check your email</h2>
          <p className="check-email-page__description">
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
              {resending ? 'Sending...' : resent ? 'Email sent!' : 'Resend verification email'}
            </Button>
          )}

          <p className="check-email-page__footer">
            <Link to="/login">Back to login</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
