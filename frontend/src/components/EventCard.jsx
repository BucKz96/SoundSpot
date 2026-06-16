import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { useFavorites } from '../favorites/useFavorites'
import ArtistDetailsModal from './ArtistDetailsModal'
import ProviderBadge from './ProviderBadge'

const GENERIC_ARTIST_NAMES = new Set([
  'artist',
  'artists',
  'live music',
  'multiple artists',
  'organizer',
  'organizers',
  'unknown',
  'unknown artist',
  'various',
  'various artists',
])

function displayArtist(artist) {
  const raw = (artist || '').trim()
  if (!raw) return 'Unknown artist'
  if (raw.toLowerCase() === 'various artists') return 'Various artists'
  return raw
}

function hasArtistDetails(artist) {
  const normalizedArtist = (artist || '').trim().toLocaleLowerCase()
  return normalizedArtist.length > 1 && !GENERIC_ARTIST_NAMES.has(normalizedArtist)
}

function displayVenue(venue) {
  const v = (venue || '').trim()
  return v || 'Venue TBA'
}

function displayCityCountry(city, country) {
  const c = (city || '').trim()
  const co = (country || '').trim()
  if (c && co) return `${c}, ${co}`
  if (c) return c
  if (co) return co
  return 'Location TBA'
}

function displayDate(date) {
  const d = (date || '').trim()
  return d || 'Date TBA'
}

function displayTime(time) {
  const t = (time || '').trim()
  return t || null
}

function displayDateParts(date) {
  const d = (date || '').trim()
  if (!d) return { day: '--', month: 'Date' }

  const parsedDate = new Date(`${d}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime())) {
    return { day: '--', month: 'Date' }
  }

  return {
    day: parsedDate.toLocaleDateString('en-US', { day: '2-digit' }),
    month: parsedDate.toLocaleDateString('en-US', { month: 'short' }),
  }
}

function EventCard({ event }) {
  const {
    isAuthenticated,
    openAuthModal,
    refreshCurrentUser,
  } = useAuth()
  const {
    addFavorite,
    removeFavorite,
    isFavorite,
    isFavoritePending,
  } = useFavorites()
  const [showArtistDetails, setShowArtistDetails] = useState(false)
  const [favoriteError, setFavoriteError] = useState('')
  const title = (event.name || '').trim() || 'Untitled event'
  const artist = displayArtist(event.artist)
  const canShowArtistDetails = hasArtistDetails(event.artist)
  const venue = displayVenue(event.venue)
  const location = displayCityCountry(event.city, event.country)
  const date = displayDate(event.date)
  const time = displayTime(event.time)
  const dateParts = displayDateParts(event.date)
  const ticketUrl = (event.ticket_url || '').trim()
  const favorite = isFavorite(event)
  const favoritePending = isFavoritePending(event)
  const favoriteLabel = favorite
    ? `Remove ${title} from favorites`
    : `Add ${title} to favorites`

  async function handleFavoriteClick() {
    setFavoriteError('')

    if (!isAuthenticated) {
      openAuthModal('register', 'Create an account to save events.')
      return
    }

    try {
      if (favorite) await removeFavorite(event)
      else await addFavorite(event)
    } catch (error) {
      if (error?.status === 401) {
        try {
          const currentUser = await refreshCurrentUser()
          if (!currentUser) {
            openAuthModal('login', 'Your session expired. Sign in to save events.')
          } else {
            setFavoriteError('Favorite update failed. Please try again.')
          }
        } catch {
          setFavoriteError('Favorite update failed. Please try again.')
        }
        return
      }
      setFavoriteError('Favorite update failed. Please try again.')
    }
  }

  return (
    <article className="event-card">
      <button
        className={[
          'event-card__favorite',
          favorite ? 'is-favorite' : '',
          favoritePending ? 'is-loading' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        type="button"
        onClick={handleFavoriteClick}
        disabled={favoritePending}
        aria-pressed={favorite}
        aria-label={favoritePending ? 'Updating favorite' : favoriteLabel}
        title={
          favoritePending
            ? 'Updating favorite'
            : favorite
              ? 'Remove from favorites'
              : 'Add to favorites'
        }
      >
        <span className="event-card__favorite-spinner" aria-hidden="true" />
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20.6 3.8 13A5.4 5.4 0 0 1 11.4 5.3l.6.7.6-.7a5.4 5.4 0 0 1 7.6 7.7L12 20.6Z" />
        </svg>
      </button>
      <div className="event-card__topline">
        <div className="event-card__date-badge" aria-label={date}>
          <span className="event-card__date-day">{dateParts.day}</span>
          <span className="event-card__date-month">{dateParts.month}</span>
        </div>
        <div className="event-card__heading">
          <h3 className="event-card__title">{title}</h3>
          <p className="event-card__artist">{artist}</p>
          {canShowArtistDetails ? (
            <button
              className="event-card__artist-action"
              type="button"
              onClick={() => setShowArtistDetails(true)}
            >
              <span aria-hidden="true" />
              View artist
            </button>
          ) : null}
        </div>
      </div>

      <dl className="event-card__details">
        <div className="event-card__row">
          <dt>Venue</dt>
          <dd>{venue}</dd>
        </div>
        <div className="event-card__row">
          <dt>City</dt>
          <dd>{location}</dd>
        </div>
        <div className="event-card__row">
          <dt>Time</dt>
          <dd>{time ? `${date} - ${time}` : date}</dd>
        </div>
      </dl>

      <div className="event-card__actions">
        <ProviderBadge
          source={event.source}
          href={ticketUrl}
          unavailable={!ticketUrl}
        />
      </div>
      {favoriteError ? (
        <p className="event-card__favorite-error" role="alert">
          {favoriteError}
        </p>
      ) : null}
      {showArtistDetails ? (
        <ArtistDetailsModal
          artistName={event.artist.trim()}
          onClose={() => setShowArtistDetails(false)}
        />
      ) : null}
    </article>
  )
}

export default EventCard
