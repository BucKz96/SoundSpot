import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'

const verificationRequests = new Map()

function goHome() {
  window.history.pushState({}, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function VerifyEmailView({ token }) {
  const { openAuthModal, verifyEmail } = useAuth()
  const [status, setStatus] = useState(token ? 'loading' : 'error')
  const [message, setMessage] = useState(
    token
      ? 'Verifying your email...'
      : 'This verification link is invalid or expired.',
  )
  const hasVerifiedRef = useRef(false)

  useEffect(() => {
    if (hasVerifiedRef.current) return
    hasVerifiedRef.current = true

    if (!token) {
      return
    }

    const verificationRequest =
      verificationRequests.get(token) ||
      verifyEmail(token).finally(() => {
        window.setTimeout(() => verificationRequests.delete(token), 30000)
      })
    verificationRequests.set(token, verificationRequest)

    verificationRequest
      .then(() => {
        setStatus('success')
        setMessage('Email verified successfully.')
      })
      .catch(() => {
        setStatus('error')
        setMessage('This verification link is invalid or expired.')
      })
  }, [token, verifyEmail])

  return (
    <main className="auth-flow-page">
      <section className={`auth-flow-card auth-flow-card--${status}`}>
        <p className="auth-flow-card__eyebrow">SoundSpot account</p>
        <h1>{status === 'success' ? 'Email verified' : 'Verify your email'}</h1>
        <p>{message}</p>
        {status === 'loading' ? (
          <div className="auth-flow-card__loader" aria-hidden="true" />
        ) : null}
        {status === 'success' ? (
          <button type="button" onClick={goHome}>
            Continue to SoundSpot
          </button>
        ) : null}
        {status === 'error' ? (
          <button
            type="button"
            onClick={() => {
              goHome()
              openAuthModal('login')
            }}
          >
            Back to sign in
          </button>
        ) : null}
      </section>
    </main>
  )
}

export default VerifyEmailView
