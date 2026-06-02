import EventCard from './EventCard'

function EventList({
  events,
  emptyMessage,
  searchedCity,
  searchType = 'city',
  searchValue = '',
  totalEventsCount = events.length,
  currentPage = 1,
  eventsPerPage = events.length,
  onPreviousPage,
  onNextPage,
}) {
  if (events.length === 0) {
    return (
      <section
        className="events-empty"
        aria-label="No events"
        aria-live="polite"
      >
        <p className="events-empty__text">
          {emptyMessage ||
            'No events to display yet. Try searching for a city.'}
        </p>
      </section>
    )
  }

  const resultLabel = totalEventsCount > 1 ? 'events' : 'event'
  const activeSearchValue = searchValue || searchedCity
  const locationLabel = activeSearchValue
    ? `${searchType === 'artist' ? 'for' : 'in'} ${activeSearchValue}`
    : 'available'
  const totalPages = Math.max(1, Math.ceil(totalEventsCount / eventsPerPage))
  const firstVisibleEventNumber = (currentPage - 1) * eventsPerPage + 1
  const lastVisibleEventNumber = firstVisibleEventNumber + events.length - 1
  const shouldShowPagination = totalEventsCount > eventsPerPage
  const canGoPrevious = currentPage > 1
  const canGoNext = currentPage < totalPages
  const sectionClassName = [
    'event-list-section',
    shouldShowPagination
      ? 'event-list-section--paginated'
      : 'event-list-section--compact',
  ].join(' ')

  return (
    <section className={sectionClassName} aria-label="Event list">
      <div className="event-list-section__header">
        <div>
          <h2 className="event-list-section__title">Found events</h2>
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
      {shouldShowPagination ? (
        <div className="event-list-section__pagination">
          <p className="event-list-section__page-count">
            Showing {firstVisibleEventNumber}-{lastVisibleEventNumber} of{' '}
            {totalEventsCount} {resultLabel}
          </p>
          <div className="event-list-section__page-actions">
            <button
              className="event-list-section__page-button"
              type="button"
              onClick={onPreviousPage}
              disabled={!canGoPrevious}
            >
              Previous
            </button>
            <span className="event-list-section__page-status">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="event-list-section__page-button"
              type="button"
              onClick={onNextPage}
              disabled={!canGoNext}
            >
              Next
            </button>
          </div>
        </div>
      ) : (
        <div className="event-list-section__pagination">
          <p className="event-list-section__page-count">
            Showing {totalEventsCount} of {totalEventsCount} {resultLabel}
          </p>
        </div>
      )}
    </section>
  )
}

export default EventList
