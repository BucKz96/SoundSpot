import EventCard from './EventCard'

function EventList({ events, emptyMessage }) {
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

  return (
    <section className="event-list-section" aria-label="Liste des concerts">
      <h2 className="event-list-section__title">Concerts</h2>
      <div className="event-list">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  )
}

export default EventList
