export async function getEvents() {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
  const response = await fetch(`${baseUrl}/api/events`)

  if (!response.ok) {
    throw new Error(`Failed to load events (${response.status})`)
  }

  return response.json()
}

export async function getEventsByCity(city) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
  const cityParam = encodeURIComponent(city)
  const response = await fetch(`${baseUrl}/api/events/search?city=${cityParam}`)

  if (!response.ok) {
    throw new Error(`Failed to search events (${response.status})`)
  }

  return response.json()
}

export async function getEventsByArtist(artist) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
  const artistParam = encodeURIComponent(artist)
  const response = await fetch(`${baseUrl}/api/events/search?artist=${artistParam}`)

  if (!response.ok) {
    throw new Error(`Failed to search events (${response.status})`)
  }

  return response.json()
}
