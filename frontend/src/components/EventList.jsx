import EventCard from './EventCard'

function EventList({
  events,
  emptyMessage,
  searchedCity,
  searchType = 'city',
  searchValue = '',
  totalEventsCount = events.length,
  visibleEventsCount = events.length,
  canLoadMore = false,
  onLoadMore,
}) {
  if (events.length === 0) {
    return (
      <section
        className="events-empty"
        aria-label="No concerts"
        aria-live="polite"
      >
        <p className="events-empty__text">
          {emptyMessage ||
            'No concerts to display yet. Try searching for a city.'}
        </p>
      </section>
    )
  }

  const resultLabel = totalEventsCount > 1 ? 'events' : 'event'
  const activeSearchValue = searchValue || searchedCity
  const locationLabel = activeSearchValue
    ? `${searchType === 'artist' ? 'for' : 'in'} ${activeSearchValue}`
    : 'available'

  return (
    <section className="event-list-section" aria-label="Concert list">
      <div className="event-list-section__header">
        <div>
          <h2 className="event-list-section__title">Found concerts</h2>
          <p className="event-list-section__meta">
            {totalEventsCount} {resultLabel} {locationLabel}
          </p>
        </div>
      </div>
      <div className="event-list">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
      <div className="event-list-section__footer">
        <p className="event-list-section__visible-count">
          Showing {visibleEventsCount} of {totalEventsCount} {resultLabel}
        </p>
        {canLoadMore ? (
          <button
            className="event-list-section__load-more"
            type="button"
            onClick={onLoadMore}
          >
            Load more
          </button>
        ) : null}
      </div>
    </section>
  )
}

export default EventList
