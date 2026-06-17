import PublicPageLayout from '../components/PublicPageLayout'

function LegalPage() {
  return (
    <PublicPageLayout
      kicker="Legal and Terms"
      title="Terms for using SoundSpot"
      subtitle="SoundSpot is a discovery service. Ticket purchases, event management and final availability remain handled by third-party providers."
    >
      <section className="public-card">
        <h2>Discovery service</h2>
        <p>
          SoundSpot helps users discover live music events. It aggregates and
          presents event information from external sources, but it is not the
          official seller or organizer of the listed events.
        </p>
      </section>

      <section className="public-card">
        <h2>External providers and ticketing</h2>
        <p>
          Event details and ticket links may come from providers such as
          Ticketmaster, Shotgun and OpenAgenda. Purchases, refunds, entry
          conditions and support for tickets are handled on third-party sites.
        </p>
      </section>

      <section className="public-card">
        <h2>Event accuracy</h2>
        <p>
          Prices, availability, dates, times, venues and lineups can change.
          SoundSpot aims to display useful event information, but it cannot
          guarantee complete coverage or perfectly current data for every event.
          Always check the official provider page before making plans.
        </p>
      </section>

      <section className="public-card">
        <h2>Reasonable use</h2>
        <p>
          Use SoundSpot in a way that respects the service, other users and
          external providers. Do not attempt to abuse, scrape, disrupt or bypass
          access controls in the application.
        </p>
      </section>

      <section className="public-card">
        <h2>Intellectual property</h2>
        <p>
          The SoundSpot name, interface and product materials belong to
          SoundSpot or their respective owners. Provider names, event names,
          artist names and related content remain owned by their respective
          rights holders.
        </p>
      </section>

      <section className="public-card">
        <h2>Legal contact</h2>
        <p>
          For legal questions, contact{' '}
          <a href="mailto:hello@soundspot.app">hello@soundspot.app</a>.
        </p>
      </section>
    </PublicPageLayout>
  )
}

export default LegalPage
