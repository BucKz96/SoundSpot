import SiteHeader from '../components/SiteHeader'
import SearchBar from '../components/SearchBar'
import MapPreview from '../components/MapPreview'
import EventList from '../components/EventList'
import { useEffect, useState } from 'react'
import { getEvents, getEventsByCity } from '../services/api'

function HomePage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastSearchedCity, setLastSearchedCity] = useState('')

  useEffect(() => {
    async function loadEvents() {
      try {
        const data = await getEvents()
        setEvents(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }

    loadEvents()
  }, [])

  async function handleSearch(city) {
    setLoading(true)
    setError('')
    setLastSearchedCity(city.trim())

    try {
      if (!city.trim()) {
        const allEvents = await getEvents()
        setEvents(allEvents)
        return
      }

      const filteredEvents = await getEventsByCity(city.trim())
      setEvents(filteredEvents)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="home-page">
      <div className="home-layout">
        <SiteHeader
          title="SoundSpot"
          subtitle="Explore les concerts par ville avec une carte interactive."
        />
        <SearchBar onSearch={handleSearch} loading={loading} />
        <MapPreview />
        {loading ? <p>Chargement des concerts...</p> : null}
        {error ? <p>Erreur: {error}</p> : null}
        {!loading && !error && lastSearchedCity && events.length === 0 ? (
          <p>Aucun concert trouve pour "{lastSearchedCity}".</p>
        ) : null}
        {!loading && !error ? <EventList events={events} /> : null}
      </div>
    </main>
  )
}

export default HomePage
