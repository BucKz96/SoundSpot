import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getCurrentUser,
  forgotPassword as requestForgotPassword,
  loginUser,
  logoutUser,
  registerUser,
  resendVerificationEmail as requestResendVerificationEmail,
  resetPassword as requestResetPassword,
  verifyEmail as requestVerifyEmail,
} from '../services/api'
import AuthModal from '../components/AuthModal'
import { AuthContext } from './AuthContext'

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [authModal, setAuthModal] = useState(null)
  const authRequestVersion = useRef(0)

  const refreshCurrentUser = useCallback(async () => {
    const requestVersion = authRequestVersion.current + 1
    authRequestVersion.current = requestVersion
    setIsAuthLoading(true)

    try {
      const currentUser = await getCurrentUser()
      if (authRequestVersion.current === requestVersion) {
        setUser(currentUser)
      }
      return currentUser
    } catch (error) {
      if (error?.status === 401) {
        if (authRequestVersion.current === requestVersion) {
          setUser(null)
        }
        return null
      }
      if (authRequestVersion.current === requestVersion) {
        setUser(null)
      }
      throw error
    } finally {
      if (authRequestVersion.current === requestVersion) {
        setIsAuthLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    let ignore = false
    const requestVersion = authRequestVersion.current

    getCurrentUser()
      .then((currentUser) => {
        if (!ignore && authRequestVersion.current === requestVersion) {
          setUser(currentUser)
        }
      })
      .catch(() => {
        if (!ignore && authRequestVersion.current === requestVersion) {
          setUser(null)
        }
      })
      .finally(() => {
        if (!ignore && authRequestVersion.current === requestVersion) {
          setIsAuthLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  const login = useCallback(async (payload) => {
    const response = await loginUser(payload)
    authRequestVersion.current += 1
    setUser(response.user)
    setIsAuthLoading(false)
    return response.user
  }, [])

  const register = useCallback(async (payload) => {
    const response = await registerUser(payload)
    authRequestVersion.current += 1
    setUser(response.user)
    setIsAuthLoading(false)
    return response.user
  }, [])

  const logout = useCallback(async () => {
    await logoutUser()
    authRequestVersion.current += 1
    setUser(null)
    setIsAuthLoading(false)
  }, [])

  const verifyEmail = useCallback(async (token) => {
    const response = await requestVerifyEmail(token)
    authRequestVersion.current += 1
    if (response?.user) {
      setUser(response.user)
      setIsAuthLoading(false)
    } else {
      await refreshCurrentUser()
    }
    return response
  }, [refreshCurrentUser])

  const resendVerificationEmail = useCallback(async () => {
    return requestResendVerificationEmail()
  }, [])

  const forgotPassword = useCallback(async (email) => {
    return requestForgotPassword(email)
  }, [])

  const resetPassword = useCallback(async (token, password) => {
    return requestResetPassword(token, password)
  }, [])

  const openAuthModal = useCallback((mode = 'login', message = '') => {
    setAuthModal({ mode, message })
  }, [])

  const closeAuthModal = useCallback(() => {
    setAuthModal(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAuthLoading,
      login,
      register,
      logout,
      verifyEmail,
      resendVerificationEmail,
      forgotPassword,
      resetPassword,
      refreshCurrentUser,
      openAuthModal,
      closeAuthModal,
    }),
    [
      user,
      isAuthLoading,
      login,
      register,
      logout,
      verifyEmail,
      resendVerificationEmail,
      forgotPassword,
      resetPassword,
      refreshCurrentUser,
      openAuthModal,
      closeAuthModal,
    ],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
      {authModal ? (
        <AuthModal
          initialMode={authModal.mode}
          message={authModal.message}
          onClose={closeAuthModal}
        />
      ) : null}
    </AuthContext.Provider>
  )
}

export default AuthProvider
