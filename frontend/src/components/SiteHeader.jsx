function SiteHeader({ title, subtitle }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <h1 id="hero-title" className="hero__title">
        {title}
      </h1>
      <p className="hero__subtitle">{subtitle}</p>
    </section>
  )
}

export default SiteHeader
