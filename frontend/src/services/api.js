const defaultBaseUrl = `${window.location.protocol}//${window.location.hostname}:8000`
const baseUrl = import.meta.env.VITE_API_BASE_URL || defaultBaseUrl
const spotifyArtistCache = new Map()
const spotifyArtistRequests = new Map()

export class AuthApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
  }
}

export class FavoriteApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'FavoriteApiError'
    this.status = status
  }
}

export class SpotifyArtistError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'SpotifyArtistError'
    this.status = status
  }
}

async function requestAuth(path, options = {}) {
  let response

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      credentials: 'include',
      headers: options.body
        ? {
            'Content-Type': 'application/json',
            ...options.headers,
          }
        : options.headers,
    })
  } catch {
    throw new AuthApiError('Unable to reach the authentication service.')
  }

  if (!response.ok) {
    const detail = await getErrorDetail(response)
    throw new AuthApiError(
      detail || `Authentication request failed with status ${response.status}`,
      response.status,
    )
  }

  if (response.status === 204) return null
  return response.json()
}

export function registerUser(payload) {
  return requestAuth('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function loginUser(payload) {
  return requestAuth('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getCurrentUser() {
  return requestAuth('/api/auth/me')
}

export function logoutUser() {
  return requestAuth('/api/auth/logout', { method: 'POST' })
}

export function verifyEmail(token) {
  return requestAuth('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

export function resendVerificationEmail() {
  return requestAuth('/api/auth/resend-verification', { method: 'POST' })
}

export function forgotPassword(email) {
  return requestAuth('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function resetPassword(token, password) {
  return requestAuth('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}

async function requestFavorites(path = '', options = {}) {
  let response

  try {
    response = await fetch(`${baseUrl}/api/favorites/events${path}`, {
      ...options,
      credentials: 'include',
      headers: options.body
        ? {
            'Content-Type': 'application/json',
            ...options.headers,
          }
        : options.headers,
    })
  } catch {
    throw new FavoriteApiError('Unable to reach the favorites service.')
  }

  if (!response.ok) {
    const detail = await getErrorDetail(response)
    throw new FavoriteApiError(
      detail || `Favorite request failed with status ${response.status}`,
      response.status,
    )
  }

  if (response.status === 204) return null
  return response.json()
}

export function getEventFavorites() {
  return requestFavorites().then((favorites) => {
    if (!Array.isArray(favorites)) {
      throw new FavoriteApiError('Invalid favorites response.')
    }
    return favorites
  })
}

export function createEventFavorite(eventPayload) {
  return requestFavorites('', {
    method: 'POST',
    body: JSON.stringify(eventPayload),
  })
}

export function deleteEventFavorite(favoriteId) {
  return requestFavorites(`/${encodeURIComponent(favoriteId)}`, {
    method: 'DELETE',
  })
}

function normalizeArtistCacheKey(name) {
  return name.trim().toLocaleLowerCase()
}

async function getErrorDetail(response) {
  try {
    const data = await response.json()
    return typeof data?.detail === 'string' ? data.detail : ''
  } catch {
    return ''
  }
}

async function getJsonArray(response, errorMessage) {
  if (!response.ok) {
    throw new Error(`${errorMessage} (${response.status})`)
  }

  const data = await response.json()
  if (!Array.isArray(data)) {
    throw new Error(`${errorMessage}: invalid response format`)
  }

  return data
}


export async function getEvents() {
  const response = await fetch(`${baseUrl}/api/events`)

  return getJsonArray(response, 'Failed to load events')
}

export async function getEventsByCity(city) {
  const cityParam = encodeURIComponent(city)
  const response = await fetch(`${baseUrl}/api/events/search?city=${cityParam}`)

  return getJsonArray(response, 'Failed to search events')
}

export async function getDiscoveryEvents() {
  const response = await fetch(`${baseUrl}/api/events/discovery`)

  return getJsonArray(response, 'Failed to load discovery events')
}

export async function getEventsByArtist(artist) {
  const artistParam = encodeURIComponent(artist)
  const response = await fetch(`${baseUrl}/api/events/search?artist=${artistParam}`)

  return getJsonArray(response, 'Failed to search events')
}

async function requestSpotifyArtist(normalizedName, cacheKey) {
  let response
  try {
    response = await fetch(
      `${baseUrl}/api/artists/spotify/search?name=${encodeURIComponent(normalizedName)}`,
    )
  } catch {
    throw new SpotifyArtistError('Unable to reach the artist service')
  }

  if (!response.ok) {
    const detail = await getErrorDetail(response)
    if (response.status === 404) {
      spotifyArtistCache.set(cacheKey, null)
    }
    throw new SpotifyArtistError(
      detail || `Artist request failed with status ${response.status}`,
      response.status,
    )
  }

  const artist = await response.json()
  if (!artist || typeof artist !== 'object' || Array.isArray(artist)) {
    throw new SpotifyArtistError('Invalid artist response')
  }

  spotifyArtistCache.set(cacheKey, artist)
  return artist
}

export async function getSpotifyArtist(name) {
  const normalizedName = name.trim()
  if (!normalizedName) {
    throw new SpotifyArtistError('Artist name is required', 400)
  }

  const cacheKey = normalizeArtistCacheKey(normalizedName)
  if (spotifyArtistCache.has(cacheKey)) {
    const cachedArtist = spotifyArtistCache.get(cacheKey)
    if (cachedArtist === null) {
      throw new SpotifyArtistError('No reliable Spotify match found', 404)
    }
    return cachedArtist
  }

  if (spotifyArtistRequests.has(cacheKey)) {
    return spotifyArtistRequests.get(cacheKey)
  }

  const request = requestSpotifyArtist(normalizedName, cacheKey).finally(() => {
    spotifyArtistRequests.delete(cacheKey)
  })
  spotifyArtistRequests.set(cacheKey, request)

  return request
}
