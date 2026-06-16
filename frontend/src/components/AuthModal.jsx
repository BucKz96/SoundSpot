import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../auth/useAuth'

function getAuthErrorMessage(error, mode) {
  if (error?.status === 409) {
    return 'An account already exists for this email.'
  }

  if (error?.status === 401 && mode === 'login') {
    return 'Invalid email or password.'
  }

  if (error?.status === 422) {
    return 'Please check the information entered and try again.'
  }

  return 'Authentication is temporarily unavailable. Please try again.'
}

function AuthModal({ initialMode = 'login', message = '', onClose }) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const emailInputRef = useRef(null)
  const isSubmittingRef = useRef(false)
  const previousFocusRef = useRef(null)
  const titleId = useId()
  const descriptionId = useId()
  const isRegister = mode === 'register'

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    previousFocusRef.current = document.activeElement
    document.body.style.overflow = 'hidden'
    emailInputRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !isSubmittingRef.current) onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [onClose])

  function switchMode(nextMode) {
    setMode(nextMode)
    setPassword('')
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Email and password are required.')
      return
    }

    if (isRegister && password.length < 8) {
      setError('Password must contain at least 8 characters.')
      return
    }

    isSubmittingRef.current = true
    setIsSubmitting(true)
    let succeeded = false

    try {
      if (isRegister) {
        await register({
          email: email.trim(),
          display_name: displayName.trim() || null,
          password,
        })
      } else {
        await login({ email: email.trim(), password })
      }
      succeeded = true
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError, mode))
    } finally {
      isSubmittingRef.current = false
      setIsSubmitting(false)
    }

    if (succeeded) onClose()
  }

  return createPortal(
    <div
      className="auth-modal__overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose()
      }}
    >
      <section
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <button
          className="auth-modal__close"
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Close authentication dialog"
        >
          &times;
        </button>

        <div className="auth-modal__heading">
          <p className="auth-modal__eyebrow">SoundSpot account</p>
          <h2 id={titleId}>
            {isRegister ? 'Create your account' : 'Welcome back'}
          </h2>
          <p id={descriptionId}>
            {message ||
              (isRegister
                ? 'Create an account to prepare your personalized SoundSpot experience.'
                : 'Sign in to continue exploring live music with your account.')}
          </p>
        </div>

        <div className="auth-modal__tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={!isRegister}
            className={!isRegister ? 'is-active' : ''}
            onClick={() => switchMode('login')}
            disabled={isSubmitting}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isRegister}
            className={isRegister ? 'is-active' : ''}
            onClick={() => switchMode('register')}
            disabled={isSubmitting}
          >
            Create account
          </button>
        </div>

        <form className="auth-modal__form" onSubmit={handleSubmit} noValidate>
          <label>
            <span>Email</span>
            <input
              ref={emailInputRef}
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              disabled={isSubmitting}
            />
          </label>

          {isRegister ? (
            <label>
              <span>Display name <small>Optional</small></span>
              <input
                type="text"
                name="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="nickname"
                maxLength={80}
                disabled={isSubmitting}
              />
            </label>
          ) : null}

          <label>
            <span>Password</span>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              minLength={isRegister ? 8 : undefined}
              required
              disabled={isSubmitting}
            />
          </label>

          {error ? (
            <p className="auth-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            className="auth-modal__submit"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? isRegister
                ? 'Creating account...'
                : 'Signing in...'
              : isRegister
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>
      </section>
    </div>,
    document.body,
  )
}

export default AuthModal
