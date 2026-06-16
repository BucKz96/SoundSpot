import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import {
  createEventFavorite,
  deleteEventFavorite,
  getEventFavorites,
} from '../services/api'
import { FavoritesContext } from './FavoritesContext'

const EMPTY_FAVORITES = []

function normalizeValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function getEventId(event) {
  return normalizeValue(event?.event_id || event?.id)
}

function getFavoriteKey(event) {
  const source = normalizeValue(event?.source).toLocaleLowerCase()
  const eventId = getEventId(event)
  return source && eventId ? `${source}:${eventId}` : ''
}

function getEventImageUrl(event) {
  return normalizeValue(
    event?.image_url ||
      event?.image ||
      event?.images?.[0]?.url,
  )
}

function toFavoritePayload(event) {
  return {
    event_id: getEventId(event),
    source: normalizeValue(event?.source).toLocaleLowerCase(),
    event_name: normalizeValue(event?.event_name || event?.name),
    artist: normalizeValue(event?.artist) || null,
    city: normalizeValue(event?.city) || null,
    country: normalizeValue(event?.country) || null,
    venue: normalizeValue(event?.venue) || null,
    date: normalizeValue(event?.date) || null,
    time: normalizeValue(event?.time) || null,
    ticket_url: normalizeValue(event?.ticket_url) || null,
    image_url: getEventImageUrl(event) || null,
  }
}

function FavoritesProvider({ children }) {
  const { user, isAuthenticated, isAuthLoading } = useAuth()
  const [favorites, setFavorites] = useState([])
  const [isFavoritesLoading, setIsFavoritesLoading] = useState(false)
  const [pendingKeys, setPendingKeys] = useState(() => new Set())
  const [favoritesError, setFavoritesError] = useState('')
  const [loadedUserId, setLoadedUserId] = useState('')

  const loadFavorites = useCallback(async () => {
    if (!isAuthenticated) {
      setFavorites([])
      setFavoritesError('')
      return []
    }

    setIsFavoritesLoading(true)
    setFavoritesError('')

    try {
      const nextFavorites = await getEventFavorites()
      setFavorites(nextFavorites)
      return nextFavorites
    } catch (error) {
      setFavoritesError(
        error?.status === 401
          ? 'Sign in to load your favorite events.'
          : 'Favorite events are temporarily unavailable.',
      )
      throw error
    } finally {
      setIsFavoritesLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    let ignore = false

    if (isAuthLoading) {
      return () => {
        ignore = true
      }
    }

    if (!isAuthenticated) {
      queueMicrotask(() => {
        if (ignore) return
        setFavorites([])
        setPendingKeys(new Set())
        setFavoritesError('')
        setLoadedUserId('')
      })
      return () => {
        ignore = true
      }
    }

    getEventFavorites()
      .then((nextFavorites) => {
        if (!ignore) {
          setFavorites(nextFavorites)
          setFavoritesError('')
        }
      })
      .catch(() => {
        if (!ignore) {
          setFavorites([])
          setFavoritesError('Favorite events are temporarily unavailable.')
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoadedUserId(user.id)
          setIsFavoritesLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [user, isAuthenticated, isAuthLoading])

  const visibleFavorites = isAuthenticated ? favorites : EMPTY_FAVORITES
  const visibleError = isAuthenticated ? favoritesError : ''
  const visibleLoading =
    isAuthenticated && (isFavoritesLoading || loadedUserId !== user.id)

  const favoriteLookup = useMemo(
    () =>
      new Map(
        visibleFavorites.map((favorite) => [
          getFavoriteKey(favorite),
          favorite,
        ]),
      ),
    [visibleFavorites],
  )

  const setPending = useCallback((key, isPending) => {
    setPendingKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys)
      if (isPending) nextKeys.add(key)
      else nextKeys.delete(key)
      return nextKeys
    })
  }, [])

  const addFavorite = useCallback(
    async (event) => {
      const key = getFavoriteKey(event)
      const payload = toFavoritePayload(event)

      if (!key || !payload.event_name) {
        throw new Error('This event cannot be saved because required details are missing.')
      }

      setPending(key, true)
      setFavoritesError('')

      try {
        const createdFavorite = await createEventFavorite(payload)
        setFavorites((currentFavorites) => [
          createdFavorite,
          ...currentFavorites.filter(
            (favorite) => getFavoriteKey(favorite) !== key,
          ),
        ])
        return createdFavorite
      } catch (error) {
        if (error?.status === 409) {
          await loadFavorites()
          return null
        }

        setFavoritesError(
          error?.status === 401
            ? 'Sign in to save events.'
            : 'Unable to save this event right now.',
        )
        throw error
      } finally {
        setPending(key, false)
      }
    },
    [loadFavorites, setPending],
  )

  const removeFavorite = useCallback(
    async (event) => {
      const key = getFavoriteKey(event)
      const favorite = favoriteLookup.get(key)
      if (!key || !favorite) return

      setPending(key, true)
      setFavoritesError('')

      try {
        await deleteEventFavorite(favorite.id)
        setFavorites((currentFavorites) =>
          currentFavorites.filter(
            (currentFavorite) => getFavoriteKey(currentFavorite) !== key,
          ),
        )
      } catch (error) {
        if (error?.status === 404) {
          setFavorites((currentFavorites) =>
            currentFavorites.filter(
              (currentFavorite) => getFavoriteKey(currentFavorite) !== key,
            ),
          )
          return
        }

        setFavoritesError(
          error?.status === 401
            ? 'Sign in to manage your favorite events.'
            : 'Unable to remove this event right now.',
        )
        throw error
      } finally {
        setPending(key, false)
      }
    },
    [favoriteLookup, setPending],
  )

  const isFavorite = useCallback(
    (event) => favoriteLookup.has(getFavoriteKey(event)),
    [favoriteLookup],
  )

  const isFavoritePending = useCallback(
    (event) => pendingKeys.has(getFavoriteKey(event)),
    [pendingKeys],
  )

  const value = useMemo(
    () => ({
      favorites: visibleFavorites,
      isFavoritesLoading: visibleLoading,
      favoritesError: visibleError,
      loadFavorites,
      addFavorite,
      removeFavorite,
      isFavorite,
      isFavoritePending,
    }),
    [
      visibleFavorites,
      visibleLoading,
      visibleError,
      loadFavorites,
      addFavorite,
      removeFavorite,
      isFavorite,
      isFavoritePending,
    ],
  )

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  )
}

export default FavoritesProvider
