import EventCard from './EventCard'

function EventList({ events }) {
  if (events.length === 0) {
    return null
  }

  return (
    <section className="event-list-section" aria-label="Liste des concerts">
      <h2>Concerts a venir</h2>
      <div className="event-list">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  )
}

export default EventList
