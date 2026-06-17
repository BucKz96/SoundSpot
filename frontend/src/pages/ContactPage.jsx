import PublicPageLayout from '../components/PublicPageLayout'

const CONTACT_EMAIL = 'hello@soundspot.app'

function ContactPage() {
  return (
    <PublicPageLayout
      kicker="Contact"
      title="Get in touch with SoundSpot"
      subtitle="For the V1, contact is intentionally simple: use email for product questions, provider questions and bug reports."
    >
      <section className="public-card public-card--contact">
        <h2>General contact</h2>
        <p>
          For product questions, launch updates or general feedback, contact
          the SoundSpot team by email.
        </p>
        <a className="public-email-link" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </section>

      <section className="public-card">
        <h2>Data and provider questions</h2>
        <p>
          If you notice an event that appears outdated, duplicated or attached
          to the wrong provider, include the event name, city, date and source
          in your message.
        </p>
      </section>

      <section className="public-card">
        <h2>Bug reports</h2>
        <p>
          For bug reports, include the page, search terms, browser and a short
          description of what happened. SoundSpot does not use a public contact
          form yet, so no message is submitted from this page.
        </p>
      </section>
    </PublicPageLayout>
  )
}

export default ContactPage
