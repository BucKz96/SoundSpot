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
        {loading ? (
          <div
            className="status-banner status-banner--loading"
            role="status"
            aria-live="polite"
          >
            <p className="status-banner__title">Chargement en cours…</p>
            <p className="status-banner__detail">
              Récupération des concerts, merci de patienter quelques secondes.
            </p>
          </div>
        ) : null}
        {error ? (
          <div className="status-banner status-banner--error" role="alert">
            <p className="status-banner__title">{"Impossible d'afficher les concerts"}</p>
            <p className="status-banner__detail">{error}</p>
            <p className="status-banner__hint">
              Vérifie que le backend tourne et que ta connexion fonctionne, puis réessaie.
            </p>
          </div>
        ) : null}
        {!loading && !error ? (
          <EventList
            events={events}
            emptyMessage={
              lastSearchedCity
                ? `Aucun concert trouvé pour « ${lastSearchedCity} ». Essaie une autre ville ou une orthographe proche.`
                : 'Aucun concert à afficher pour le moment.'
            }
          />
        ) : null}
      </div>
    </main>
  )
}

export default HomePage
