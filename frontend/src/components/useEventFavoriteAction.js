import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { useFavorites } from '../favorites/useFavorites'

function useEventFavoriteAction(event) {
  const {
    isAuthenticated,
    openAuthModal,
    refreshCurrentUser,
  } = useAuth()
  const {
    addFavorite,
    removeFavorite,
    isFavorite,
    isFavoritePending,
  } = useFavorites()
  const [favoriteError, setFavoriteError] = useState('')
  const favorite = isFavorite(event)
  const favoritePending = isFavoritePending(event)

  async function toggleFavorite() {
    setFavoriteError('')

    if (!isAuthenticated) {
      openAuthModal('register', 'Create an account to save events.')
      return
    }

    try {
      if (favorite) await removeFavorite(event)
      else await addFavorite(event)
    } catch (error) {
      if (error?.status === 401) {
        try {
          const currentUser = await refreshCurrentUser()
          if (!currentUser) {
            openAuthModal('login', 'Your session expired. Sign in to save events.')
          } else {
            setFavoriteError('Favorite update failed. Please try again.')
          }
        } catch {
          setFavoriteError('Favorite update failed. Please try again.')
        }
        return
      }
      setFavoriteError('Favorite update failed. Please try again.')
    }
  }

  return {
    favorite,
    favoritePending,
    favoriteError,
    toggleFavorite,
  }
}

export default useEventFavoriteAction
