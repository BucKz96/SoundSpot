const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
const spotifyArtistCache = new Map()

export class SpotifyArtistError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'SpotifyArtistError'
    this.status = status
  }
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
