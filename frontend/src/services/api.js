export async function getEvents() {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
  const response = await fetch(`${baseUrl}/api/events`)

  if (!response.ok) {
    throw new Error(`Failed to load events (${response.status})`)
  }

  return response.json()
}
