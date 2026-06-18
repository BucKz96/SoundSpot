import { useState } from 'react'
import { useAuth } from '../auth/useAuth'

function goHome() {
  window.history.pushState({}, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function removeResetTokenFromUrl() {
  window.history.replaceState({}, '', '/reset-password')
}

function ResetPasswordView({ token }) {
  const { openAuthModal, resetPassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState(token ? 'idle' : 'error')
  const [message, setMessage] = useState(
    token ? '' : 'This reset link is invalid or expired.',
  )

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')

    if (!token) {
      setStatus('error')
      setMessage('This reset link is invalid or expired.')
      return
    }
    if (password.length < 8) {
      setStatus('idle')
      setMessage('Password must contain at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setStatus('idle')
      setMessage('Passwords do not match.')
      return
    }

    setStatus('loading')
    try {
      await resetPassword(token, password)
      removeResetTokenFromUrl()
      setStatus('success')
      setPassword('')
      setConfirmPassword('')
      setMessage('Password updated. You can now sign in.')
    } catch {
      setStatus('error')
      setMessage('This reset link is invalid or expired.')
    }
  }

  return (
    <main className="auth-flow-page">
      <section className={`auth-flow-card auth-flow-card--${status}`}>
        <p className="auth-flow-card__eyebrow">SoundSpot account</p>
        <h1>Reset your password</h1>
        {status === 'success' || status === 'error' ? <p>{message}</p> : null}
        {status !== 'success' && status !== 'error' ? (
          <form className="auth-flow-card__form" onSubmit={handleSubmit} noValidate>
            <label>
              <span>New password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                disabled={status === 'loading'}
              />
            </label>
            <label>
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                disabled={status === 'loading'}
              />
            </label>
            {message ? (
              <p className="auth-flow-card__message" role="alert">
                {message}
              </p>
            ) : null}
            <button type="submit" disabled={status === 'loading'}>
              {status === 'loading' ? 'Updating password...' : 'Update password'}
            </button>
          </form>
        ) : null}
        {status === 'success' ? (
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

export default ResetPasswordView
