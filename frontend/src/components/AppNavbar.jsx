import { useCallback, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import logo from '../assets/soundspot-logo.png'
import AuthModal from './AuthModal'

function AppNavbar() {
  const { user, isAuthenticated, isAuthLoading, logout } = useAuth()
  const [authMode, setAuthMode] = useState(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const closeAuthModal = useCallback(() => setAuthMode(null), [])

  async function handleLogout() {
    setLogoutError('')
    setIsLoggingOut(true)
    try {
      await logout()
    } catch {
      setLogoutError('Sign out failed')
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <>
      <header className="app-navbar">
        <div className="app-navbar__inner">
          <a className="app-navbar__brand" href="#explore" aria-label="SoundSpot home">
            <img className="app-navbar__logo" src={logo} alt="SoundSpot" />
            <span className="app-navbar__tagline">Explore live music around the world</span>
          </a>

          <nav className="app-navbar__nav" aria-label="Primary navigation">
            <a href="#explore-map">Explore</a>
            <a href="#how-it-works">How it works</a>
            <a href="#sources">Sources</a>
            <a href="#about">About</a>
            <a
              href="https://github.com/BucKz96/SoundSpot"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </nav>

          <div className="app-navbar__actions">
            {isAuthLoading ? (
              <span className="app-navbar__auth-loading">Checking account...</span>
            ) : isAuthenticated ? (
              <>
                <span className="app-navbar__user" title={user.email}>
                  {user.display_name || user.email}
                </span>
                {logoutError ? (
                  <span
                    className="app-navbar__logout-error"
                    role="alert"
                    title="Unable to sign out. Please try again."
                  >
                    {logoutError}
                  </span>
                ) : null}
                <button
                  className="app-navbar__logout"
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                >
                  {isLoggingOut ? 'Signing out...' : 'Logout'}
                </button>
                <a href="#explore-map">Explore events</a>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setAuthMode('login')}>
                  Sign in
                </button>
                <button
                  className="app-navbar__primary-action"
                  type="button"
                  onClick={() => setAuthMode('register')}
                >
                  Get started
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {authMode ? (
        <AuthModal
          initialMode={authMode}
          onClose={closeAuthModal}
        />
      ) : null}
    </>
  )
}

export default AppNavbar
