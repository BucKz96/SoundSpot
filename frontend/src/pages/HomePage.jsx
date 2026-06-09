import AppNavbar from '../components/AppNavbar'
import SiteHeader from '../components/SiteHeader'
import SearchBar from '../components/SearchBar'
import MapPreview from '../components/MapPreview'
import EventList from '../components/EventList'
import EventFilters from '../components/EventFilters'
import { useEffect, useMemo, useState } from 'react'
import { getDiscoveryEvents, getEventsByArtist, getEventsByCity } from '../services/api'

const EVENTS_PER_PAGE = 12
const DEFAULT_GENRE_FILTER = 'all'
const DEFAULT_SOURCE_FILTER = 'all'
const DEFAULT_QUICK_FILTER = ''
const DATE_QUICK_FILTERS = new Set(['tonight', 'week', 'month'])

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const CATEGORY_GENRES = {
  clubs: new Set(['club', 'electronic', 'techno', 'house']),
  electronic: new Set(['electronic', 'techno', 'house']),
  festivals: new Set(['festival']),
}
const CATEGORY_KEYWORDS = {
  clubs: ['club', 'nightlife', 'club night', 'dj set', 'rave', 'party', 'soiree'],
  electronic: ['electronic', 'techno', 'house', 'electro', 'dj set'],
  festivals: ['festival', 'fest'],
}
const NON_CONCERT_GENRES = new Set(['club', 'festival'])

function isValidISODate(value) {
  return ISO_DATE_PATTERN.test(value)
}

function normalizeISODate(value) {
  const trimmed = (value || '').trim()
  if (!trimmed) return null

  const isoPrefix = trimmed.slice(0, 10)
  return isValidISODate(isoPrefix) ? isoPrefix : null
}

function matchesDateRange(eventDateValue, dateFromValue, dateToValue) {
  const dateFrom = normalizeISODate(dateFromValue)
  const dateTo = normalizeISODate(dateToValue)
  const hasDateFilter = Boolean(dateFrom || dateTo)
  if (!hasDateFilter) return true

  const eventDate = normalizeISODate(eventDateValue)
  if (!eventDate) return false
  if (dateFrom && eventDate < dateFrom) return false
  if (dateTo && eventDate > dateTo) return false

  return true
}

function formatLocalISODate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date, days) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function getQuickDateRange(filter, today = new Date()) {
  const currentDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  )

  if (filter === 'tonight') {
    const date = formatLocalISODate(currentDate)
    return { dateFrom: date, dateTo: date }
  }

  if (filter === 'week') {
    const daysUntilSunday = (7 - currentDate.getDay()) % 7
    return {
      dateFrom: formatLocalISODate(currentDate),
      dateTo: formatLocalISODate(addDays(currentDate, daysUntilSunday)),
    }
  }

  const endOfMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0,
  )

  return {
    dateFrom: formatLocalISODate(currentDate),
    dateTo: formatLocalISODate(endOfMonth),
  }
}

function normalizeFilterText(value) {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function matchesCategoryQuickFilter(event, filter) {
  if (!filter) return true

  const genres = Array.isArray(event.genres)
    ? event.genres.map((genre) => normalizeFilterText(genre))
    : []
  const searchableText = normalizeFilterText(
    `${event.name || ''} ${event.venue || ''}`,
  )

  if (filter === 'concerts') {
    const hasConcertGenre = genres.some(
      (genre) => genre && !NON_CONCERT_GENRES.has(genre),
    )
    const hasConcertKeyword = ['concert', 'live', 'gig', 'show', 'tour'].some(
      (keyword) => searchableText.includes(keyword),
    )
    return hasConcertGenre || hasConcertKeyword
  }

  return (
    genres.some((genre) => CATEGORY_GENRES[filter]?.has(genre)) ||
    CATEGORY_KEYWORDS[filter]?.some((keyword) =>
      searchableText.includes(keyword),
    ) ||
    false
  )
}

function HomePage() {
  const [events, setEvents] = useState([])
  const [discoveryEvents, setDiscoveryEvents] = useState([])
  const [discoveryLoading, setDiscoveryLoading] = useState(true)
  const [discoveryError, setDiscoveryError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastSearch, setLastSearch] = useState({ type: 'city', value: '' })
  const [hasSearched, setHasSearched] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedGenre, setSelectedGenre] = useState(DEFAULT_GENRE_FILTER)
  const [selectedSource, setSelectedSource] = useState(DEFAULT_SOURCE_FILTER)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [activeQuickFilter, setActiveQuickFilter] = useState(DEFAULT_QUICK_FILTER)

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const eventGenres = Array.isArray(event.genres) ? event.genres : []
        const matchesGenre =
          selectedGenre === DEFAULT_GENRE_FILTER ||
          eventGenres.includes(selectedGenre)
        const matchesSource =
          selectedSource === DEFAULT_SOURCE_FILTER ||
          (event.source || '').trim().toLowerCase() === selectedSource

        return (
          matchesGenre &&
          matchesSource &&
          matchesDateRange(event.date, dateFrom, dateTo) &&
          matchesCategoryQuickFilter(
            event,
            DATE_QUICK_FILTERS.has(activeQuickFilter) ? '' : activeQuickFilter,
          )
        )
      }),
    [
      events,
      selectedGenre,
      selectedSource,
      dateFrom,
      dateTo,
      activeQuickFilter,
    ],
  )

  const startIndex = (currentPage - 1) * EVENTS_PER_PAGE
  const endIndex = startIndex + EVENTS_PER_PAGE
  const paginatedEvents = filteredEvents.slice(startIndex, endIndex)
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PER_PAGE))
  const mapEvents = hasSearched ? filteredEvents : discoveryEvents
  const mapLoading = hasSearched ? loading : discoveryLoading
  const emptyEventsMessage =
    events.length > 0 && filteredEvents.length === 0
      ? 'No events match these filters. Try another genre, date range, or source.'
      : lastSearch.value
        ? `No events found for ${lastSearch.value}. Try another genre, date range, or source.`
        : 'No events to display yet.'

  useEffect(() => {
    let ignore = false

    async function loadDiscoveryEvents() {
      setDiscoveryLoading(true)
      setDiscoveryError('')

      try {
        const discoveryResults = await getDiscoveryEvents()
        if (!ignore) {
          setDiscoveryEvents(discoveryResults)
        }
      } catch (err) {
        if (!ignore) {
          setDiscoveryError(err instanceof Error ? err.message : 'Unknown error')
          setDiscoveryEvents([])
        }
      } finally {
        if (!ignore) {
          setDiscoveryLoading(false)
        }
      }
    }

    loadDiscoveryEvents()

    return () => {
      ignore = true
    }
  }, [])

  function resetFilters() {
    setSelectedGenre(DEFAULT_GENRE_FILTER)
    setSelectedSource(DEFAULT_SOURCE_FILTER)
    setDateFrom('')
    setDateTo('')
    setActiveQuickFilter(DEFAULT_QUICK_FILTER)
    setCurrentPage(1)
  }

  function handleGenreChange(value) {
    setSelectedGenre(value)
    if (activeQuickFilter && !DATE_QUICK_FILTERS.has(activeQuickFilter)) {
      setActiveQuickFilter(DEFAULT_QUICK_FILTER)
    }
    setCurrentPage(1)
  }

  function handleSourceChange(value) {
    setSelectedSource(value)
    setCurrentPage(1)
  }

  function handleDateFromChange(value) {
    setDateFrom(value)
    if (DATE_QUICK_FILTERS.has(activeQuickFilter)) {
      setActiveQuickFilter(DEFAULT_QUICK_FILTER)
    }
    setCurrentPage(1)
  }

  function handleDateToChange(value) {
    setDateTo(value)
    if (DATE_QUICK_FILTERS.has(activeQuickFilter)) {
      setActiveQuickFilter(DEFAULT_QUICK_FILTER)
    }
    setCurrentPage(1)
  }

  function handleQuickFilter(filter) {
    if (activeQuickFilter === filter) {
      if (DATE_QUICK_FILTERS.has(filter)) {
        setDateFrom('')
        setDateTo('')
      }
      setActiveQuickFilter(DEFAULT_QUICK_FILTER)
    } else {
      if (DATE_QUICK_FILTERS.has(activeQuickFilter)) {
        setDateFrom('')
        setDateTo('')
      }

      if (DATE_QUICK_FILTERS.has(filter)) {
        const range = getQuickDateRange(filter)
        setDateFrom(range.dateFrom)
        setDateTo(range.dateTo)
      }

      setActiveQuickFilter(filter)
    }

    setCurrentPage(1)
  }

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
      resetFilters()
      return
    }

    setLoading(true)
    setError('')
    setLastSearch({ type: searchType, value: normalizedValue })
    setHasSearched(true)
    setCurrentPage(1)
    resetFilters()

    try {
      const searchResults =
        searchType === 'artist'
          ? await getEventsByArtist(normalizedValue)
          : await getEventsByCity(normalizedValue)

      setEvents(searchResults)
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
            title="Find concerts, clubs and live music events around you."
            subtitle="Search by city or artist, explore the map, and discover where to go next."
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
            {hasSearched && !loading && !error ? (
              <EventFilters
                selectedGenre={selectedGenre}
                selectedSource={selectedSource}
                dateFrom={dateFrom}
                dateTo={dateTo}
                activeQuickFilter={activeQuickFilter}
                searchLabel={lastSearch.value}
                eventsCount={filteredEvents.length}
                loading={loading}
                onGenreChange={handleGenreChange}
                onSourceChange={handleSourceChange}
                onDateFromChange={handleDateFromChange}
                onDateToChange={handleDateToChange}
                onQuickFilter={handleQuickFilter}
                onReset={resetFilters}
              />
            ) : null}
            <MapPreview
              events={mapEvents}
              loading={mapLoading}
              hasSearched={hasSearched}
              searchValue={lastSearch.value}
              discoveryError={discoveryError}
            />
          </div>
          {hasSearched && !loading && !error ? (
            <div className="content-panel content-panel--events">
              <EventList
                events={paginatedEvents}
                searchType={lastSearch.type}
                searchValue={lastSearch.value}
                totalEventsCount={filteredEvents.length}
                currentPage={currentPage}
                eventsPerPage={EVENTS_PER_PAGE}
                onPreviousPage={handlePreviousPage}
                onNextPage={handleNextPage}
                emptyMessage={emptyEventsMessage}
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
                <p>Discover local organizers, club nights, concerts and independent scenes across France and Europe.</p>
              </div>
            </article>
            <article className="source-card">
              <span className="source-card__icon" aria-hidden="true">
                <img src="/providers/ticketmaster.png" alt="" />
              </span>
              <div>
                <h3>Ticketmaster</h3>
                <p>Explore large concerts, major venues and international event listings.</p>
              </div>
            </article>
            <article className="source-card">
              <span className="source-card__icon" aria-hidden="true">
                <img src="/providers/openagenda.png" alt="" />
              </span>
              <div>
                <h3>OpenAgenda</h3>
                <p>Discover curated local concerts, festivals and cultural music events across France and Europe.</p>
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
