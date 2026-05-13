function displayArtist(artist) {
  const raw = (artist || '').trim()
  if (!raw) return 'Artiste inconnu'
  if (raw.toLowerCase() === 'various artists') return 'Plusieurs artistes'
  return raw
}

function displayVenue(venue) {
  const v = (venue || '').trim()
  return v || 'Salle non communiquée'
}

function displayCityCountry(city, country) {
  const c = (city || '').trim()
  const co = (country || '').trim()
  if (c && co) return `${c}, ${co}`
  if (c) return c
  if (co) return co
  return 'Lieu non précisé'
}

function displayDate(date) {
  const d = (date || '').trim()
  return d || 'Date non communiquée'
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
    day: parsedDate.toLocaleDateString('fr-FR', { day: '2-digit' }),
    month: parsedDate.toLocaleDateString('fr-FR', { month: 'short' }),
  }
}

function EventCard({ event }) {
  const title = (event.name || '').trim() || 'Événement sans titre'
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
          <dt>Lieu</dt>
          <dd>{venue}</dd>
        </div>
        <div className="event-card__row">
          <dt>Ville</dt>
          <dd>{location}</dd>
        </div>
        <div className="event-card__row">
          <dt>Horaire</dt>
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
            Voir les billets
          </a>
        ) : (
          <span className="event-card__ticket-missing">Billets : lien indisponible</span>
        )}
      </div>
    </article>
  )
}

export default EventCard
