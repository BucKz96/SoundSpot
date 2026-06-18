import PublicPageLayout from '../components/PublicPageLayout'

function AboutPage() {
  return (
    <PublicPageLayout
      kicker="About SoundSpot"
      title="A map-first way to discover live music"
      subtitle="SoundSpot brings live music listings into a focused discovery experience, so you can explore what is happening by city, artist, venue and source."
    >
      <section className="public-card">
        <h2>What is SoundSpot?</h2>
        <p>
          SoundSpot is a web app for discovering concerts, club nights,
          festivals and other live music events on a map. The product is built
          around quick exploration: search for a city, artist or venue, compare
          nearby results, then continue to the original ticketing or event page.
        </p>
      </section>

      <section className="public-card">
        <h2>Why it exists</h2>
        <p>
          Live music discovery is often split across multiple tabs, providers
          and local calendars. SoundSpot reduces that friction by aggregating
          event information into one clear interface while keeping the official
          provider as the place where final details and ticket actions happen.
        </p>
      </section>

      <section className="public-card">
        <h2>Data sources</h2>
        <p>
          The V1 experience uses event data from Ticketmaster, Shotgun and
          OpenAgenda. Artist pages may also use Spotify data to enrich artist
          context when a reliable match is available.
        </p>
        <p>
          SoundSpot does not sell tickets directly. Event details, prices,
          availability and checkout remain managed by the original providers.
        </p>
      </section>

      <section className="public-card">
        <h2>What is next</h2>
        <p>
          The product roadmap focuses on improving coverage, personalization
          and saved-event workflows without hiding where event data comes from
          or where users complete ticket purchases.
        </p>
      </section>
    </PublicPageLayout>
  )
}

export default AboutPage
