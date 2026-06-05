const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

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
