import AppNavbar from '../components/AppNavbar'
import SiteHeader from '../components/SiteHeader'
import SearchBar from '../components/SearchBar'
import MapPreview from '../components/MapPreview'
import EventList from '../components/EventList'
import { useState } from 'react'
import { getEventsByArtist, getEventsByCity } from '../services/api'

const INITIAL_VISIBLE_EVENTS = 12
const LOAD_MORE_STEP = 12

function HomePage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastSearch, setLastSearch] = useState({ type: 'city', value: '' })
  const [hasSearched, setHasSearched] = useState(false)
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_EVENTS)

  const visibleEvents = events.slice(0, visibleCount)
  const canLoadMore = visibleCount < events.length

  function handleLoadMore() {
    setVisibleCount((currentCount) => currentCount + LOAD_MORE_STEP)
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
      setVisibleCount(INITIAL_VISIBLE_EVENTS)
      return
    }

    setLoading(true)
    setError('')
    setLastSearch({ type: searchType, value: normalizedValue })
    setHasSearched(true)
    setVisibleCount(INITIAL_VISIBLE_EVENTS)

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
            title="Find live music in any city."
            subtitle="Search a city, explore real concerts from Ticketmaster, and open ticket links from a clean fullstack web experience."
          />
          <div className="hero-search">
            <SearchBar onSearch={handleSearch} loading={loading} />
          </div>
          {error ? (
            <div className="status-banner status-banner--error" role="alert">
              <p className="status-banner__title">Unable to display concerts</p>
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
                events={visibleEvents}
                searchType={lastSearch.type}
                searchValue={lastSearch.value}
                totalEventsCount={events.length}
                visibleEventsCount={visibleEvents.length}
                canLoadMore={canLoadMore}
                onLoadMore={handleLoadMore}
                emptyMessage={
                  lastSearch.value
                    ? `No concerts found for this ${lastSearch.type}.`
                    : 'No concerts to display yet.'
                }
              />
            </div>
          ) : null}
        </section>

        <section className="info-section" id="how-it-works" aria-labelledby="how-title">
          <div className="section-heading">
            <p className="section-kicker">How it works</p>
            <h2 id="how-title">A simple search flow for live music discovery.</h2>
          </div>
          <div className="steps-grid">
            <article className="step-card">
              <h3>Search a city</h3>
              <p>Enter a city name and SoundSpot sends the request to the FastAPI backend.</p>
            </article>
            <article className="step-card">
              <h3>Explore live events</h3>
              <p>The backend queries Ticketmaster and returns clean event data to the frontend.</p>
            </article>
            <article className="step-card">
              <h3>Open ticket links</h3>
              <p>Each event card keeps the important venue, city, date and ticket link visible.</p>
            </article>
          </div>
        </section>

        <section className="info-section about-section" id="about" aria-labelledby="about-title">
          <div className="section-heading">
            <p className="section-kicker">About SoundSpot</p>
            <h2 id="about-title">A focused way to discover live music by city.</h2>
          </div>
          <div className="about-panel">
            <p>
              SoundSpot helps users quickly find upcoming concerts in a city, scan
              the essential event details, and open official ticket links without
              getting lost in cluttered listings.
            </p>
            <ul className="about-list">
              <li>Search-first experience built for fast city exploration.</li>
              <li>Clear event cards that keep venue, date and ticket access visible.</li>
              <li>Responsive dark interface designed for a modern music product feel.</li>
            </ul>
            <p className="about-tech">Built with React, FastAPI and Ticketmaster API.</p>
          </div>
        </section>

        <section className="info-section contact-section" id="contact" aria-labelledby="contact-title">
          <div className="section-heading">
            <p className="section-kicker">Contact / GitHub</p>
            <h2 id="contact-title">Review the project and follow its evolution.</h2>
          </div>
          <div className="contact-panel">
            <p>
              This project is designed as a professional fullstack portfolio piece,
              with frontend and backend deployed independently.
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
          <span>Built as a fullstack portfolio project.</span>
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
