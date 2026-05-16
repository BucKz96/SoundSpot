function SiteHeader({ title, subtitle }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <p className="hero__eyebrow">Concert discovery powered by Ticketmaster</p>
      <h1 id="hero-title" className="hero__title">
        {title}
      </h1>
      <p className="hero__subtitle">{subtitle}</p>
    </section>
  )
}

export default SiteHeader
