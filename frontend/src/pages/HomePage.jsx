import SiteHeader from '../components/SiteHeader'
import SearchBar from '../components/SearchBar'
import MapPreview from '../components/MapPreview'
import EventList from '../components/EventList'

function HomePage() {
  const selectedCity = 'Paris'

  const mockEvents = [
    {
      id: 1,
      title: 'Electro Night',
      artist: 'Nova Pulse',
      date: '14 Juin 2026',
      venue: 'Le Dome',
      city: 'Paris',
    },
    {
      id: 2,
      title: 'Sunset Pop Live',
      artist: 'Luna Waves',
      date: '21 Juin 2026',
      venue: 'Arena Bastille',
      city: 'Paris',
    },
    {
      id: 3,
      title: 'Indie Sessions',
      artist: 'The Urban Trees',
      date: '30 Juin 2026',
      venue: 'La Scene Centrale',
      city: 'Paris',
    },
  ]

  return (
    <main className="home-page">
      <div className="home-layout">
        <SiteHeader
          title="SoundSpot"
          subtitle="Explore les concerts par ville avec une carte interactive."
        />
        <SearchBar cityPlaceholder="Rechercher une ville (ex: Paris)" />
        <MapPreview cityName={selectedCity} />
        <EventList events={mockEvents} />
      </div>
    </main>
  )
}

export default HomePage
