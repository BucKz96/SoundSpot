function EventCard({ event }) {
  return (
    <article className="event-card">
      <h3>{event.name}</h3>
      <p>{event.artist}</p>
      <p>
        {event.date} - {event.time}
      </p>
      <p>
        {event.venue}, {event.city}
      </p>
    </article>
  )
}

export default EventCard
