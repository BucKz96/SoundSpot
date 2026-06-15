import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
} from '../services/api'
import { AuthContext } from './AuthContext'

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)

  const refreshCurrentUser = useCallback(async () => {
    setIsAuthLoading(true)

    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      return currentUser
    } catch (error) {
      if (error?.status === 401) {
        setUser(null)
        return null
      }
      setUser(null)
      throw error
    } finally {
      setIsAuthLoading(false)
    }
  }, [])

  useEffect(() => {
    let ignore = false

    getCurrentUser()
      .then((currentUser) => {
        if (!ignore) setUser(currentUser)
      })
      .catch(() => {
        if (!ignore) setUser(null)
      })
      .finally(() => {
        if (!ignore) setIsAuthLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [])

  const login = useCallback(async (payload) => {
    const response = await loginUser(payload)
    setUser(response.user)
    return response.user
  }, [])

  const register = useCallback(async (payload) => {
    const response = await registerUser(payload)
    setUser(response.user)
    return response.user
  }, [])

  const logout = useCallback(async () => {
    await logoutUser()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAuthLoading,
      login,
      register,
      logout,
      refreshCurrentUser,
    }),
    [
      user,
      isAuthLoading,
      login,
      register,
      logout,
      refreshCurrentUser,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
