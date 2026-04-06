import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle } from 'lucide-react'
import { api } from '../services/api'
import Spinner from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import './VerifyEmailPage.css'

type Status = 'loading' | 'success' | 'error'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<Status>(() => token ? 'loading' : 'error')
  const [errorMessage, setErrorMessage] = useState(() => token ? '' : 'No verification token provided.')

  useEffect(() => {
    if (!token) return

    let cancelled = false

    api
      .get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => {
        if (!cancelled) setStatus('success')
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus('error')
          setErrorMessage(err instanceof Error ? err.message : 'Verification failed')
        }
      })

    return () => { cancelled = true }
  }, [token])

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