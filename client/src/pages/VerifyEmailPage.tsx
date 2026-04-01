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
      <div className="verify-email-page__hero">
        <div className="verify-email-page__hero-content">
          <h1 className="verify-email-page__hero-title">Financial Assistant</h1>
          <p className="verify-email-page__hero-sub">
            Connect your accounts. Get personalized budget insights powered by AI.
          </p>
        </div>
      </div>

      <div className="verify-email-page__form-side">
        <div className="verify-email-page__box">
          {status === 'loading' && (
            <>
              <Spinner size="lg" />
              <h2 className="verify-email-page__heading">Verifying your email...</h2>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="verify-email-page__icon verify-email-page__icon--success">
                <CheckCircle size={40} />
              </div>
              <h2 className="verify-email-page__heading">Email verified!</h2>
              <p className="verify-email-page__description">
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
              <h2 className="verify-email-page__heading">Verification failed</h2>
              <p className="verify-email-page__description">
                {errorMessage}
              </p>
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
    </div>
  )
}
