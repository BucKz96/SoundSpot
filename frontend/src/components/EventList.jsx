import EventCard from './EventCard'

function EventList({ events }) {
  return (
    <section className="event-list-section" aria-label="Liste de concerts">
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
