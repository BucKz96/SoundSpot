import EventCard from './EventCard'

function EventList({ events, emptyMessage, searchedCity }) {
  if (events.length === 0) {
    return (
      <section
        className="events-empty"
        aria-label="Aucun concert"
        aria-live="polite"
      >
        <p className="events-empty__text">
          {emptyMessage ||
            'Aucun concert à afficher pour le moment. Essaie une recherche par ville.'}
        </p>
      </section>
    )
  }

  const resultLabel = events.length > 1 ? 'événements' : 'événement'
  const locationLabel = searchedCity ? `à ${searchedCity}` : 'disponibles'

  return (
    <section className="event-list-section" aria-label="Liste des concerts">
      <div className="event-list-section__header">
        <div>
          <h2 className="event-list-section__title">Concerts trouvés</h2>
          <p className="event-list-section__meta">
            {events.length} {resultLabel} {locationLabel}
          </p>
        </div>
      </div>
      <div className="event-list">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  )
}

export default EventList
