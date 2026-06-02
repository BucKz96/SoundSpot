import AppNavbar from '../components/AppNavbar'
import SiteHeader from '../components/SiteHeader'
import SearchBar from '../components/SearchBar'
import MapPreview from '../components/MapPreview'
import EventList from '../components/EventList'
import { useState } from 'react'
import { getEventsByArtist, getEventsByCity } from '../services/api'

const EVENTS_PER_PAGE = 12

function HomePage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastSearch, setLastSearch] = useState({ type: 'city', value: '' })
  const [hasSearched, setHasSearched] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const startIndex = (currentPage - 1) * EVENTS_PER_PAGE
  const endIndex = startIndex + EVENTS_PER_PAGE
  const paginatedEvents = events.slice(startIndex, endIndex)
  const totalPages = Math.max(1, Math.ceil(events.length / EVENTS_PER_PAGE))

  function handlePreviousPage() {
    setCurrentPage((page) => Math.max(1, page - 1))
  }

  function handleNextPage() {
    setCurrentPage((page) => Math.min(totalPages, page + 1))
  }

  async function handleSearch(search) {
    const searchType = search.type === 'artist' ? 'artist' : 'city'
    const normalizedValue = search.value.trim()

    if (!normalizedValue) {
      setEvents([])
      setLoading(false)
      setError('')
      setLastSearch({ type: searchType, value: '' })
      setHasSearched(false)
      setCurrentPage(1)
      return
    }

    setLoading(true)
    setError('')
    setLastSearch({ type: searchType, value: normalizedValue })
    setHasSearched(true)
    setCurrentPage(1)

    try {
      const filteredEvents =
        searchType === 'artist'
          ? await getEventsByArtist(normalizedValue)
          : await getEventsByCity(normalizedValue)

      setEvents(filteredEvents)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-page">
      <AppNavbar />
      <main className="home-page" id="main-content">
        <section className="home-main-inner explore-section" id="explore">
          <SiteHeader
            title="Discover live events across cities and scenes."
            subtitle="Search by city or artist and explore events on an interactive map."
          />
          <div className="hero-search">
            <SearchBar onSearch={handleSearch} loading={loading} />
          </div>
          {error ? (
            <div className="status-banner status-banner--error" role="alert">
              <p className="status-banner__title">Unable to display events</p>
              <p className="status-banner__detail">{error}</p>
              <p className="status-banner__hint">
                Check that the backend is running and try again.
              </p>
            </div>
          ) : null}
          <div className="content-panel content-panel--map">
            <MapPreview
              events={events}
              loading={loading}
              searchedCity={lastSearch.type === 'city' ? lastSearch.value : ''}
              searchLabel={lastSearch.value}
            />
          </div>
          {hasSearched && !loading && !error ? (
            <div className="content-panel content-panel--events">
              <EventList
                events={paginatedEvents}
                searchType={lastSearch.type}
                searchValue={lastSearch.value}
                totalEventsCount={events.length}
                currentPage={currentPage}
                eventsPerPage={EVENTS_PER_PAGE}
                onPreviousPage={handlePreviousPage}
                onNextPage={handleNextPage}
                emptyMessage={
                  lastSearch.value
                    ? `No events found for this ${lastSearch.type}.`
                    : 'No events to display yet.'
                }
              />
            </div>
          ) : null}
        </section>

        <section className="info-section" id="how-it-works" aria-labelledby="how-title">
          <div className="section-heading">
            <p className="section-kicker">How it works</p>
            <h2 id="how-title">A faster way to find the right night out.</h2>
          </div>
          <div className="steps-grid">
            <article className="step-card">
              <h3>Search your way</h3>
              <p>Start with a city for nearby events, or search an artist when you already know who you want to see.</p>
            </article>
            <article className="step-card">
              <h3>Scan the scene</h3>
              <p>Browse upcoming events in a focused list while the map keeps venues and nearby locations in view.</p>
            </article>
            <article className="step-card">
              <h3>Choose the source</h3>
              <p>Provider badges show where each event comes from, with clear links to continue on the original platform.</p>
            </article>
          </div>
        </section>

        <section className="info-section sources-section" id="sources" aria-labelledby="sources-title">
          <div className="section-heading">
            <p className="section-kicker">Event sources</p>
            <h2 id="sources-title">Local scenes and major tours in one search.</h2>
          </div>
          <div className="sources-grid">
            <article className="source-card">
              <span className="source-card__icon" aria-hidden="true">
                <img src="/providers/shotgun.png" alt="" />
              </span>
              <div>
                <h3>Shotgun</h3>
                <p className="source-card__accent">Local scenes and club events</p>
                <p>Discover local organizers, club nights, concerts and independent scenes across France and Europe.</p>
              </div>
            </article>
            <article className="source-card">
              <span className="source-card__icon" aria-hidden="true">
                <img src="/providers/ticketmaster.png" alt="" />
              </span>
              <div>
                <h3>Ticketmaster</h3>
                <p className="source-card__accent">Major tours and venues</p>
                <p>Explore large concerts, major venues and international event listings.</p>
              </div>
            </article>
          </div>
        </section>

        <section className="info-section about-section" id="about" aria-labelledby="about-title">
          <div className="section-heading">
            <p className="section-kicker">About SoundSpot</p>
            <h2 id="about-title">A focused event discovery service for live music fans.</h2>
          </div>
          <div className="about-panel">
            <p>
              SoundSpot brings upcoming live music into a single, readable view so users
              can move from curiosity to a real event plan without jumping between tabs.
            </p>
            <ul className="about-list">
              <li>City and artist search for different discovery moods.</li>
              <li>Map-first context for venues, clusters and nearby event density.</li>
              <li>Clean event cards that keep source, venue, date and link access visible.</li>
            </ul>
          </div>
        </section>

        <section className="info-section build-section" id="build" aria-labelledby="build-title">
          <div className="section-heading">
            <p className="section-kicker">Behind the build</p>
            <h2 id="build-title">Built as a fullstack product project.</h2>
          </div>
          <div className="about-panel build-panel">
            <p>
              SoundSpot is also a portfolio-grade fullstack project with a React frontend,
              a FastAPI backend, external event APIs, normalized event data, and separate
              frontend/backend deployment paths.
            </p>
          </div>
        </section>

        <section className="info-section contact-section" id="contact" aria-labelledby="contact-title">
          <div className="section-heading">
            <p className="section-kicker">Contact / GitHub</p>
            <h2 id="contact-title">Review the project and follow its evolution.</h2>
          </div>
          <div className="contact-panel">
            <p>
              Browse the repository for the implementation details, roadmap and deployment
              structure behind SoundSpot.
            </p>
            <a
              className="contact-link"
              href="https://github.com/BucKz96/SoundSpot"
              target="_blank"
              rel="noreferrer"
            >
              View repository on GitHub
            </a>
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <div className="app-footer__content">
          <p>© 2026 SoundSpot. All rights reserved.</p>
          <span>Live event discovery powered by multiple sources.</span>
        </div>
        <a
          className="app-footer__link"
          href="https://github.com/BucKz96/SoundSpot"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </footer>
    </div>
  )
}

export default HomePage
