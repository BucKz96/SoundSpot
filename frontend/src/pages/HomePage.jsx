import SiteHeader from '../components/SiteHeader'

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
