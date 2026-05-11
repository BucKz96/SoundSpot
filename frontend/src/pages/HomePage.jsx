import SiteHeader from '../components/SiteHeader'
<<<<<<< Updated upstream
=======
import SearchBar from '../components/SearchBar'
import MapPreview from '../components/MapPreview'
import EventList from '../components/EventList'
import { mockEvents, selectedCity } from './homeData'
>>>>>>> Stashed changes

function HomePage() {
  return (
    <main className="home-page">
      <SiteHeader
        title="SoundSpot"
        subtitle="Explore les concerts par ville avec une carte interactive."
      />
    </main>
  )
}

export default HomePage
