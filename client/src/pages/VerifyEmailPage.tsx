import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Mail } from 'lucide-react'
import { api } from '../services/api'
import Spinner from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import './VerifyEmailPage.css'

type Status = 'confirm' | 'loading' | 'success' | 'error'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<Status>(() => token ? 'confirm' : 'error')
  const [errorMessage, setErrorMessage] = useState(() => token ? '' : 'No verification token provided.')

  // The API call is deferred until the user explicitly clicks the button.
  // This prevents email security scanners from pre-fetching the link and
  // consuming the token before the user has a chance to verify manually.
  function handleConfirm() {
    if (!token) return
    setStatus('loading')

    api
      .get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => setStatus('success'))
      .catch((err: unknown) => {
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : 'Verification failed')
      })
  }

  return (
    <div className="verify-email-page">
      <div className="verify-email-page__bg" aria-hidden="true">
        <div className="verify-email-page__orb verify-email-page__orb--1" />
        <div className="verify-email-page__orb verify-email-page__orb--2" />
      </div>

      <div className="verify-email-page__card">
        <Link to="/" className="verify-email-page__logo" aria-label="FinanceAI home">
          <span className="verify-email-page__logo-icon" aria-hidden="true" />
          <span className="verify-email-page__logo-text">FinanceAI</span>
        </Link>

        {status === 'confirm' && (
          <>
            <div className="verify-email-page__icon">
              <Mail size={40} />
            </div>
            <h1 className="verify-email-page__heading">Confirm your email</h1>
            <p className="verify-email-page__sub">
              Click the button below to verify your email address and activate your account.
            </p>
            <Button variant="cta" fullWidth onClick={handleConfirm}>
              Verify my email
            </Button>
          </>
        )}

        {status === 'loading' && (
          <>
            <Spinner size="lg" />
            <h1 className="verify-email-page__heading">Verifying your email…</h1>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="verify-email-page__icon verify-email-page__icon--success">
              <CheckCircle size={40} />
            </div>
            <h1 className="verify-email-page__heading">Email verified!</h1>
            <p className="verify-email-page__sub">
              Your account is ready. You can now log in.
            </p>
            <Link to="/login">
              <Button variant="cta" fullWidth>Go to login</Button>
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="verify-email-page__icon verify-email-page__icon--error">
              <XCircle size={40} />
            </div>
            <h1 className="verify-email-page__heading">Verification failed</h1>
            <p className="verify-email-page__sub">{errorMessage}</p>
            <Link to="/check-email">
              <Button variant="secondary" fullWidth>Resend verification email</Button>
            </Link>
            <p className="verify-email-page__footer">
              <Link to="/login">Back to login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
