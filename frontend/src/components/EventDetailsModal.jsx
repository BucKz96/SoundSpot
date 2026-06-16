import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ArtistDetailsModal from './ArtistDetailsModal'
import ProviderBadge from './ProviderBadge'
import useEventFavoriteAction from './useEventFavoriteAction'

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

function displayValue(value, fallback) {
  const normalized = (value || '').trim()
  return normalized || fallback
}

function displayLocation(event) {
  const city = (event.city || '').trim()
  const country = (event.country || '').trim()
  if (city && country) return `${city}, ${country}`
  return city || country || 'Location TBA'
}

function displayDateTime(event) {
  const date = (event.date || '').trim()
  const time = (event.time || '').trim()
  if (date && time) return `${date} - ${time}`
  return date || time || 'Date TBA'
}

function hasArtistDetails(artist) {
  const normalizedArtist = (artist || '').trim().toLocaleLowerCase()
  return normalizedArtist.length > 1 && !GENERIC_ARTIST_NAMES.has(normalizedArtist)
}

function EventDetailsModal({ event, onClose }) {
  const [showArtistDetails, setShowArtistDetails] = useState(false)
  const showArtistDetailsRef = useRef(false)
  const closeButtonRef = useRef(null)
  const previousFocusRef = useRef(null)
  const titleId = useId()
  const descriptionId = useId()
  const title = displayValue(event.name || event.event_name, 'Untitled event')
  const artist = displayValue(event.artist, 'Unknown artist')
  const venue = displayValue(event.venue, 'Venue TBA')
  const location = displayLocation(event)
  const dateTime = displayDateTime(event)
  const ticketUrl = (event.ticket_url || '').trim()
  const canShowArtistDetails = hasArtistDetails(event.artist)
  const {
    favorite,
    favoritePending,
    favoriteError,
    toggleFavorite,
  } = useEventFavoriteAction(event)
  const favoriteLabel = favorite
    ? `Remove ${title} from favorites`
    : `Add ${title} to favorites`

  useEffect(() => {
    showArtistDetailsRef.current = showArtistDetails
  }, [showArtistDetails])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    previousFocusRef.current = document.activeElement
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    function handleKeyDown(keyEvent) {
      if (keyEvent.key === 'Escape' && !showArtistDetailsRef.current) onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [onClose])

  return createPortal(
    <>
      <div
        className="event-modal__overlay"
        role="presentation"
        onMouseDown={(mouseEvent) => {
          if (mouseEvent.target === mouseEvent.currentTarget) onClose()
        }}
      >
        <section
          className="event-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
        >
          <div className="event-modal__topbar">
            <ProviderBadge source={event.source} compact />
            <button
              ref={closeButtonRef}
              className="event-modal__close"
              type="button"
              onClick={onClose}
              aria-label="Close event details"
            >
              &times;
            </button>
          </div>

          <div className="event-modal__header">
            <p className="event-modal__eyebrow">Event details</p>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{artist}</p>
          </div>

          <dl className="event-modal__details">
            <div>
              <dt>Date</dt>
              <dd>{dateTime}</dd>
            </div>
            <div>
              <dt>Venue</dt>
              <dd>{venue}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{location}</dd>
            </div>
          </dl>

          <div className="event-modal__actions">
            {ticketUrl ? (
              <a
                className="event-modal__ticket"
                href={ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get tickets <span aria-hidden="true">&#8599;</span>
              </a>
            ) : (
              <p className="event-modal__ticket-unavailable">
                Ticket link unavailable.
              </p>
            )}
            <button
              className={[
                'event-modal__favorite',
                favorite ? 'is-favorite' : '',
                favoritePending ? 'is-loading' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              type="button"
              onClick={toggleFavorite}
              disabled={favoritePending}
              aria-pressed={favorite}
              aria-label={favoritePending ? 'Updating favorite' : favoriteLabel}
            >
              {favoritePending
                ? 'Updating...'
                : favorite
                  ? 'Saved'
                  : 'Save event'}
            </button>
            {canShowArtistDetails ? (
              <button
                className="event-modal__artist"
                type="button"
                onClick={() => setShowArtistDetails(true)}
              >
                View artist
              </button>
            ) : null}
          </div>

          {favoriteError ? (
            <p className="event-modal__error" role="alert">
              {favoriteError}
            </p>
          ) : null}
        </section>
      </div>

      {showArtistDetails ? (
        <ArtistDetailsModal
          artistName={event.artist.trim()}
          onClose={() => setShowArtistDetails(false)}
        />
      ) : null}
    </>,
    document.body,
  )
}

export default EventDetailsModal
