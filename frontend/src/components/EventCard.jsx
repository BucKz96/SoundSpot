function EventCard({ event }) {
  return (
    <article className="event-card">
      <h3>{event.title}</h3>
      <p>{event.artist}</p>
      <p>
        {event.date} - {event.venue}
      </p>
      <p>{event.city}</p>
    </article>
  )
}

export default EventCard
