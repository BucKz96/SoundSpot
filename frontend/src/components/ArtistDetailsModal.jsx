import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getSpotifyArtist } from '../services/api'

function getArtistImage(artist) {
  if (typeof artist?.image_url === 'string') return artist.image_url
  if (typeof artist?.image === 'string') return artist.image
  if (Array.isArray(artist?.images)) return artist.images[0]?.url || ''
  return ''
}

function getSpotifyUrl(artist) {
  return (
    artist?.spotify_url ||
    artist?.external_url ||
    artist?.external_urls?.spotify ||
    ''
  )
}

function getFollowers(artist) {
  const followers =
    typeof artist?.followers === 'object'
      ? artist.followers?.total
      : artist?.followers

  return Number.isFinite(followers)
    ? new Intl.NumberFormat('en-US').format(followers)
    : null
}

function ArtistDetailsSkeleton() {
  return (
    <div className="artist-modal__skeleton" aria-hidden="true">
      <div className="artist-modal__skeleton-image" />
      <div className="artist-modal__skeleton-content">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

function ArtistDetailsModal({ artistName, onClose }) {
  const [artist, setArtist] = useState(null)
  const [status, setStatus] = useState('loading')
  const [imageFailed, setImageFailed] = useState(false)
  const closeButtonRef = useRef(null)
  const previousFocusRef = useRef(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    let ignore = false

    getSpotifyArtist(artistName)
      .then((result) => {
        if (!ignore) {
          setArtist(result)
          setStatus('success')
        }
      })
      .catch((error) => {
        if (!ignore) {
          setStatus(error?.status === 404 ? 'not-found' : 'error')
        }
      })

    return () => {
      ignore = true
    }
  }, [artistName])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    previousFocusRef.current = document.activeElement
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [onClose])

  const imageUrl = imageFailed ? '' : getArtistImage(artist)
  const spotifyUrl = getSpotifyUrl(artist)
  const followers = getFollowers(artist)
  const genres = Array.isArray(artist?.genres) ? artist.genres.filter(Boolean) : []
  const popularity = Number.isFinite(artist?.popularity)
    ? artist.popularity
    : null

  return createPortal(
    <div
      className="artist-modal__overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="artist-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="artist-modal__topbar">
          <span className="artist-modal__provider">Spotify</span>
          <button
            ref={closeButtonRef}
            className="artist-modal__close"
            type="button"
            onClick={onClose}
            aria-label="Close artist details"
          >
            &times;
          </button>
        </div>

        {status === 'loading' ? (
          <>
            <h2 className="artist-modal__sr-only" id={titleId}>
              Loading {artistName}
            </h2>
            <p className="artist-modal__sr-only" id={descriptionId}>
              Loading Spotify artist details.
            </p>
            <ArtistDetailsSkeleton />
          </>
        ) : null}

        {status === 'success' ? (
          <div className="artist-modal__body">
            <div className="artist-modal__visual">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <span aria-hidden="true">{artist?.name?.charAt(0) || '?'}</span>
              )}
            </div>
            <div className="artist-modal__content">
              <p className="artist-modal__eyebrow">Artist details</p>
              <h2 id={titleId}>{artist?.name || artistName}</h2>
              <p className="artist-modal__summary" id={descriptionId}>
                Spotify profile information for this event artist.
              </p>

              {genres.length > 0 ? (
                <ul className="artist-modal__genres" aria-label="Genres">
                  {genres.map((genre) => (
                    <li key={genre}>{genre}</li>
                  ))}
                </ul>
              ) : null}

              {popularity !== null || followers !== null ? (
                <dl className="artist-modal__stats">
                  {popularity !== null ? (
                    <div>
                      <dt>Popularity</dt>
                      <dd>{popularity}/100</dd>
                    </div>
                  ) : null}
                  {followers !== null ? (
                    <div>
                      <dt>Followers</dt>
                      <dd>{followers}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              {spotifyUrl ? (
                <a
                  className="artist-modal__spotify-link"
                  href={spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open on Spotify <span aria-hidden="true">&nearr;</span>
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {status === 'not-found' ? (
          <div className="artist-modal__message" role="status">
            <h2 id={titleId}>{artistName}</h2>
            <p id={descriptionId}>
              No reliable Spotify match found for this artist.
            </p>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="artist-modal__message" role="alert">
            <h2 id={titleId}>{artistName}</h2>
            <p id={descriptionId}>
              Artist details are temporarily unavailable.
            </p>
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  )
}

export default ArtistDetailsModal
