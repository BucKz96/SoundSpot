import AppNavbar from '../components/AppNavbar'
import SiteHeader from '../components/SiteHeader'
import SearchBar from '../components/SearchBar'
import MapPreview from '../components/MapPreview'
import EventList from '../components/EventList'
import EventFilters from '../components/EventFilters'
import EventDetailsModal from '../components/EventDetailsModal'
import FavoritesView from '../components/FavoritesView'
import {
  AboutSoundSpot,
  AppFooter,
  FeaturedEvents,
  FinalCTA,
  HowItWorks,
  ProductBenefits,
  SourcesStrip,
  TrendingCities,
} from '../components/LandingSections'
import { productBenefits } from '../data/landingData'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { getDiscoveryEvents, getEventsByArtist, getEventsByCity } from '../services/api'
import { buildFeaturedEvents, buildTrendingCities } from '../utils/eventDisplay'

const EVENTS_PER_PAGE = 12
const DEFAULT_GENRE_FILTER = 'all'
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

function EmailVerificationBanner() {
  const { resendVerificationEmail, user } = useAuth()
  const [status, setStatus] = useState('')
  const [isSending, setIsSending] = useState(false)

  if (!user || user.is_email_verified !== false) return null

  async function handleResend() {
    setStatus('')
    setIsSending(true)
    try {
      const response = await resendVerificationEmail()
      setStatus(response?.message || 'Verification email sent.')
    } catch {
      setStatus('Unable to send verification email right now.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="email-verification-banner" role="status">
      <div>
        <p>Please verify your email to secure your account.</p>
        {status ? <span>{status}</span> : null}
      </div>
      <button type="button" onClick={handleResend} disabled={isSending}>
        {isSending ? 'Sending...' : 'Resend email'}
      </button>
    </div>
  )
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

function formatMapTitle(value) {
  const normalizedValue = (value || '').trim()
  if (!normalizedValue) return ''

  if (normalizedValue !== normalizedValue.toLowerCase()) {
    return normalizedValue
  }

  return normalizedValue.replace(/\S+/g, (word) => {
    const [firstLetter, ...rest] = word
    return `${firstLetter.toLocaleUpperCase()}${rest.join('')}`
  })
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
  const { isAuthenticated } = useAuth()
  const [activeView, setActiveView] = useState('home')
  const [events, setEvents] = useState([])
  const [discoveryEvents, setDiscoveryEvents] = useState([])
  const [discoveryLoading, setDiscoveryLoading] = useState(true)
  const [discoveryError, setDiscoveryError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastSearch, setLastSearch] = useState({ type: 'city', value: '' })
  const [hasSearched, setHasSearched] = useState(false)
  const [eventViewMode, setEventViewMode] = useState('map')
  const [selectedEventDetails, setSelectedEventDetails] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedGenre, setSelectedGenre] = useState(DEFAULT_GENRE_FILTER)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [activeQuickFilter, setActiveQuickFilter] = useState(DEFAULT_QUICK_FILTER)
  const activeEvents = hasSearched ? events : discoveryEvents
  const hasActiveFilters = Boolean(
    selectedGenre !== DEFAULT_GENRE_FILTER ||
      dateFrom ||
      dateTo ||
      activeQuickFilter,
  )

  const filteredEvents = useMemo(
    () =>
      activeEvents.filter((event) => {
        const eventGenres = Array.isArray(event.genres) ? event.genres : []
        const matchesGenre =
          selectedGenre === DEFAULT_GENRE_FILTER ||
          eventGenres.includes(selectedGenre)

        return (
          matchesGenre &&
          matchesDateRange(event.date, dateFrom, dateTo) &&
          matchesCategoryQuickFilter(
            event,
            DATE_QUICK_FILTERS.has(activeQuickFilter) ? '' : activeQuickFilter,
          )
        )
      }),
    [
      activeEvents,
      selectedGenre,
      dateFrom,
      dateTo,
      activeQuickFilter,
    ],
  )

  const startIndex = (currentPage - 1) * EVENTS_PER_PAGE
  const endIndex = startIndex + EVENTS_PER_PAGE
  const paginatedEvents = filteredEvents.slice(startIndex, endIndex)
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PER_PAGE))
  const mapLoading = hasSearched ? loading : discoveryLoading
  const listLoading = hasSearched ? loading : discoveryLoading
  const mapTitle = hasSearched
    ? formatMapTitle(lastSearch.value)
    : 'Explore the world'
  const activeTrendingCity =
    hasSearched && lastSearch.type === 'city' ? lastSearch.value : ''
  const trendingCities = useMemo(
    () => buildTrendingCities(filteredEvents),
    [filteredEvents],
  )
  const featuredEvents = useMemo(
    () => buildFeaturedEvents(filteredEvents),
    [filteredEvents],
  )
  const emptyEventsMessage =
    activeEvents.length > 0 && filteredEvents.length === 0
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

  function handleTrendingReset() {
    handleSearch({ type: 'city', value: '' })
  }

  function showExplore(targetId = 'explore-map') {
    const resolvedTargetId =
      typeof targetId === 'string' ? targetId : 'explore-map'
    setActiveView('home')
    setEventViewMode('map')
    window.requestAnimationFrame(() => {
      document.getElementById(resolvedTargetId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  function showHomeTop() {
    setActiveView('home')
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  return (
    <div className="app-page">
      <AppNavbar
        activeView={isAuthenticated ? activeView : 'home'}
        onShowFavorites={() => setActiveView('favorites')}
        onExplore={showExplore}
        onLogoutSuccess={showHomeTop}
      />
      <EmailVerificationBanner />
      {activeView === 'favorites' && isAuthenticated ? (
        <FavoritesView onExplore={showExplore} />
      ) : (
        <main className="home-page" id="main-content">
        <section className="home-main-inner explore-section" id="explore">
          <SiteHeader
            title={
              <>
                Discover live music
                <span className="hero__title-accent"> events worldwide</span>
              </>
            }
            subtitle={
              <>
                Search by city, artist or venue and explore live events across
                the globe.
                <span>Personalized for you. Powered by trusted sources.</span>
              </>
            }
          />
          <div className="hero-search">
            <SearchBar onSearch={handleSearch} loading={loading} />
          </div>
          <ProductBenefits benefits={productBenefits} />
          {error ? (
            <div className="status-banner status-banner--error" role="alert">
              <p className="status-banner__title">Unable to display events</p>
              <p className="status-banner__detail">{error}</p>
              <p className="status-banner__hint">
                Check that the backend is running and try again.
              </p>
            </div>
          ) : null}
          <section
            className="map-showcase"
            id="explore-map"
            aria-labelledby="map-showcase-title"
          >
            <div className="content-panel content-panel--map">
              <div className="map-showcase-title-wrap">
                <h2 className="map-showcase-title" id="map-showcase-title">
                  <span>{mapTitle}</span>
                </h2>
              </div>
              <EventFilters
                selectedGenre={selectedGenre}
                dateFrom={dateFrom}
                dateTo={dateTo}
                activeQuickFilter={activeQuickFilter}
                eventViewMode={eventViewMode}
                onGenreChange={handleGenreChange}
                onDateFromChange={handleDateFromChange}
                onDateToChange={handleDateToChange}
                onQuickFilter={handleQuickFilter}
                onReset={resetFilters}
                onEventViewModeChange={setEventViewMode}
              />
              {eventViewMode === 'map' ? (
                <MapPreview
                  events={filteredEvents}
                  loading={mapLoading}
                  hasSearched={hasSearched}
                  hasActiveFilters={hasActiveFilters}
                  searchValue={lastSearch.value}
                  discoveryError={discoveryError}
                  onEventOpen={setSelectedEventDetails}
                />
              ) : (
                <div className="map-showcase__list-panel">
                  {listLoading ? (
                    <div className="event-list-section__loading" role="status">
                      Loading events...
                    </div>
                  ) : error ? (
                    <div className="event-list-section__loading" role="status">
                      Unable to load events.
                    </div>
                  ) : (
                    <EventList
                      events={paginatedEvents}
                      searchType={lastSearch.type}
                      searchValue={lastSearch.value}
                      totalEventsCount={filteredEvents.length}
                      currentPage={currentPage}
                      eventsPerPage={EVENTS_PER_PAGE}
                      onPreviousPage={handlePreviousPage}
                      onNextPage={handleNextPage}
                      onEventOpen={setSelectedEventDetails}
                      emptyMessage={emptyEventsMessage}
                    />
                  )}
                </div>
              )}
            </div>
          </section>
        </section>

        <div className="discovery-highlights">
          <TrendingCities
            activeCity={activeTrendingCity}
            cities={trendingCities}
            loading={listLoading}
            onCitySelect={(city) => handleSearch({ type: 'city', value: city })}
            onResetCity={handleTrendingReset}
          />
          <FeaturedEvents events={featuredEvents} loading={listLoading} />
        </div>
        <HowItWorks />
        <SourcesStrip />
        <AboutSoundSpot />
        <FinalCTA />
        </main>
      )}

      <AppFooter />
      {selectedEventDetails ? (
        <EventDetailsModal
          event={selectedEventDetails}
          onClose={() => setSelectedEventDetails(null)}
        />
      ) : null}
    </div>
  )
}

export default HomePage
