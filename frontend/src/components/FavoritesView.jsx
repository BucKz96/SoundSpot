import { useFavorites } from '../favorites/useFavorites'
import { getEventImageUrl } from '../utils/eventDisplay'
import ProviderBadge from './ProviderBadge'

function formatDateTime(date, time) {
  if (!date && !time) return ''
  const normalizedTime = typeof time === 'string' ? time.slice(0, 5) : ''
  if (!date) return normalizedTime
  return normalizedTime ? `${date} - ${normalizedTime}` : date
}

function formatLocation(favorite) {
  const venue = (favorite.venue || '').trim()
  const cityCountry = [favorite.city, favorite.country]
    .filter(Boolean)
    .join(', ')

  if (venue && cityCountry) return `${venue} - ${cityCountry}`
  return venue || cityCountry
}

function FavoritesView({ onExplore }) {
  const {
    favorites,
    favoritesError,
    isFavoritesLoading,
    isFavoritePending,
    removeFavorite,
  } = useFavorites()

  return (
    <main className="favorites-view" id="main-content">
      <section className="favorites-view__inner" aria-labelledby="favorites-title">
        <header className="favorites-view__header">
          <div>
            <p className="favorites-view__eyebrow">Your SoundSpot collection</p>
            <h1 id="favorites-title">My favorite events</h1>
            <p>Events you saved for later.</p>
          </div>
          <button type="button" onClick={onExplore}>
            Explore events
          </button>
        </header>

        {favoritesError ? (
          <p className="favorites-view__error" role="alert">
            {favoritesError}
          </p>
        ) : null}

        {isFavoritesLoading ? (
          <div className="favorites-view__status" role="status">
            Loading favorite events...
          </div>
        ) : favorites.length === 0 ? (
          <div className="favorites-view__empty">
            <span className="favorites-view__empty-icon" aria-hidden="true">
              &#9825;
            </span>
            <h2>No saved events yet.</h2>
            <p>Start exploring live events and save your favorites here.</p>
            <button type="button" onClick={onExplore}>
              Explore events
            </button>
          </div>
        ) : (
          <div className="favorites-view__grid">
            {favorites.map((favorite) => {
              const pending = isFavoritePending(favorite)
              const eventName = favorite.event_name || 'Untitled event'
              const location = formatLocation(favorite)
              const dateTime = formatDateTime(favorite.date, favorite.time)
              const imageUrl = getEventImageUrl(favorite)

              return (
                <article className="favorite-card" key={favorite.id}>
                  {imageUrl ? (
                    <div className="favorite-card__media" aria-hidden="true">
                      <img src={imageUrl} alt="" loading="lazy" />
                    </div>
                  ) : null}
                  <div className="favorite-card__topline">
                    <ProviderBadge source={favorite.source} compact />
                    <button
                      className="favorite-card__remove"
                      type="button"
                      onClick={() => removeFavorite(favorite).catch(() => {})}
                      disabled={pending}
                      aria-label={`Remove ${eventName} from favorites`}
                    >
                      {pending ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                  <div className="favorite-card__body">
                    <h2>{eventName}</h2>
                    {favorite.artist ? (
                      <p className="favorite-card__artist">{favorite.artist}</p>
                    ) : null}
                    {location || dateTime ? (
                      <dl className="favorite-card__details">
                        {location ? (
                          <div>
                            <dt>Location</dt>
                            <dd>{location}</dd>
                          </div>
                        ) : null}
                        {dateTime ? (
                          <div>
                            <dt>Date</dt>
                            <dd>{dateTime}</dd>
                          </div>
                        ) : null}
                      </dl>
                    ) : null}
                  </div>
                  {favorite.ticket_url ? (
                    <a
                      className="favorite-card__ticket"
                      href={favorite.ticket_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open tickets <span aria-hidden="true">&#8599;</span>
                    </a>
                  ) : (
                    <span className="favorite-card__ticket is-disabled">
                      Ticket link unavailable
                    </span>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

export default FavoritesView
