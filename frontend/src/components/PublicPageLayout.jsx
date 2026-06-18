import AppNavbar from './AppNavbar'
import { AppFooter } from './LandingSections'

function PublicPageLayout({
  kicker,
  title,
  subtitle,
  children,
}) {
  return (
    <div className="app-page">
      <AppNavbar />
      <main className="public-page" id="main-content">
        <section className="public-page__hero" aria-labelledby="public-page-title">
          <p className="section-kicker">{kicker}</p>
          <h1 id="public-page-title">{title}</h1>
          <p>{subtitle}</p>
        </section>
        <div className="public-page__content">{children}</div>
      </main>
      <AppFooter />
    </div>
  )
}

export default PublicPageLayout
