import PublicPageLayout from '../components/PublicPageLayout'

function PrivacyPage() {
  return (
    <PublicPageLayout
      kicker="Privacy Policy"
      title="How SoundSpot handles V1 data"
      subtitle="This page explains the main data handled by SoundSpot in plain language. It is intended for the current V1 product scope."
    >
      <section className="public-card">
        <h2>Account data</h2>
        <p>
          When you create an account, SoundSpot stores account information such
          as your email address, display name and authentication data. Passwords
          are never stored in plain text; only password hashes are kept on the
          server.
        </p>
      </section>

      <section className="public-card">
        <h2>Favorites</h2>
        <p>
          If you save events, SoundSpot stores the favorites connected to your
          account so they can be shown in My Favorites when you sign in again.
        </p>
      </section>

      <section className="public-card">
        <h2>Cookies and sessions</h2>
        <p>
          SoundSpot uses an HttpOnly JWT cookie for authenticated sessions. This
          helps keep the session token away from client-side JavaScript.
        </p>
      </section>

      <section className="public-card">
        <h2>Email verification and password reset</h2>
        <p>
          Email verification and password reset flows use temporary tokens. The
          server stores hashed token values rather than storing reset or
          verification tokens in plain text.
        </p>
      </section>

      <section className="public-card">
        <h2>Provider data and external links</h2>
        <p>
          Event data is aggregated from external providers such as Ticketmaster,
          Shotgun and OpenAgenda. Spotify may be used to enrich artist context
          when a reliable match is found. Third-party ticketing and provider
          pages may have their own privacy policies.
        </p>
      </section>

      <section className="public-card">
        <h2>Data sale and deletion requests</h2>
        <p>
          SoundSpot does not sell personal data. To ask about account deletion
          or personal data removal, contact privacy at{' '}
          <a href="mailto:hello@soundspot.app">hello@soundspot.app</a>.
        </p>
      </section>
    </PublicPageLayout>
  )
}

export default PrivacyPage
