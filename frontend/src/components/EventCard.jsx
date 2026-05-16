function displayArtist(artist) {
  const raw = (artist || '').trim()
  if (!raw) return 'Unknown artist'
  if (raw.toLowerCase() === 'various artists') return 'Various artists'
  return raw
}

function displayVenue(venue) {
  const v = (venue || '').trim()
  return v || 'Venue TBA'
}

function displayCityCountry(city, country) {
  const c = (city || '').trim()
  const co = (country || '').trim()
  if (c && co) return `${c}, ${co}`
  if (c) return c
  if (co) return co
  return 'Location TBA'
}

function displayDate(date) {
  const d = (date || '').trim()
  return d || 'Date TBA'
}

function displayTime(time) {
  const t = (time || '').trim()
  return t || null
}

function displayDateParts(date) {
  const d = (date || '').trim()
  if (!d) return { day: '--', month: 'Date' }

  const parsedDate = new Date(`${d}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime())) {
    return { day: '--', month: 'Date' }
  }

  return {
    day: parsedDate.toLocaleDateString('en-US', { day: '2-digit' }),
    month: parsedDate.toLocaleDateString('en-US', { month: 'short' }),
  }
}

function EventCard({ event }) {
  const title = (event.name || '').trim() || 'Untitled event'
  const artist = displayArtist(event.artist)
  const venue = displayVenue(event.venue)
  const location = displayCityCountry(event.city, event.country)
  const date = displayDate(event.date)
  const time = displayTime(event.time)
  const dateParts = displayDateParts(event.date)
  const ticketUrl = (event.ticket_url || '').trim()

  return (
    <article className="event-card">
      <div className="event-card__topline">
        <div className="event-card__date-badge" aria-label={date}>
          <span className="event-card__date-day">{dateParts.day}</span>
          <span className="event-card__date-month">{dateParts.month}</span>
        </div>
        <div className="event-card__heading">
          <h3 className="event-card__title">{title}</h3>
          <p className="event-card__artist">{artist}</p>
        </div>
      </div>

      <dl className="event-card__details">
        <div className="event-card__row">
          <dt>Venue</dt>
          <dd>{venue}</dd>
        </div>
        <div className="event-card__row">
          <dt>City</dt>
          <dd>{location}</dd>
        </div>
        <div className="event-card__row">
          <dt>Time</dt>
          <dd>{time ? `${date} · ${time}` : date}</dd>
        </div>
      </dl>

      <div className="event-card__actions">
        {ticketUrl ? (
          <a
            className="event-card__ticket-link"
            href={ticketUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View tickets
          </a>
        ) : (
          <span className="event-card__ticket-missing">Ticket link unavailable</span>
        )}
      </div>
    </article>
  )
}

export default EventCard
