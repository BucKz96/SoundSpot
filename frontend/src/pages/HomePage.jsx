import SiteHeader from '../components/SiteHeader'
import SearchBar from '../components/SearchBar'
import MapPreview from '../components/MapPreview'
import EventList from '../components/EventList'
import { useEffect, useState } from 'react'
import { getEvents } from '../services/api'

function HomePage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  return (
    <main className="home-page">
      <div className="home-layout">
        <SiteHeader
          title="SoundSpot"
          subtitle="Explore les concerts par ville avec une carte interactive."
        />
        <SearchBar />
        <MapPreview />
        {loading ? <p>Chargement des concerts...</p> : null}
        {error ? <p>Erreur: {error}</p> : null}
        {!loading && !error ? <EventList events={events} /> : null}
      </div>
    </main>
  )
}

export default HomePage
