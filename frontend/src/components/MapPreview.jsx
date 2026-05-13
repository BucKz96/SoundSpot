function getKnownValues(events, field) {
  return new Set(events.map((event) => (event[field] || '').trim()).filter(Boolean))
}

function getNextDate(events) {
  const dates = events
    .map((event) => (event.date || '').trim())
    .filter(Boolean)
    .sort()

  const nextDate = dates[0]
  if (!nextDate) return 'À confirmer'

  const parsedDate = new Date(`${nextDate}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime())) return nextDate

  return parsedDate.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function MapPreview({ events, loading, searchedCity }) {
  const venuesCount = getKnownValues(events, 'venue').size
  const countriesCount = getKnownValues(events, 'country').size
  const activeCity = searchedCity || 'Recherche globale'
  const nextDate = loading ? 'Chargement...' : getNextDate(events)
  const eventsLabel = events.length > 1 ? 'concerts' : 'concert'
  const countLabel = loading ? 'Recherche...' : `${events.length} ${eventsLabel}`

  return (
    <section className="map-preview" aria-label="Aperçu des concerts">
      <div className="map-preview__header">
        <div>
          <p className="map-preview__eyebrow">Aperçu</p>
          <h2>{activeCity}</h2>
        </div>
        <span className="map-preview__count">{countLabel}</span>
      </div>

      <div className="map-box">
        <span className="map-box__pin map-box__pin--paris" aria-hidden="true" />
        <span className="map-box__pin map-box__pin--london" aria-hidden="true" />
        <span className="map-box__pin map-box__pin--berlin" aria-hidden="true" />
        <div className="map-box__label">
          <span>Zone explorée</span>
          <strong>{activeCity}</strong>
        </div>
      </div>

      <dl className="map-preview__stats">
        <div>
          <dt>Prochaine date</dt>
          <dd>{nextDate}</dd>
        </div>
        <div>
          <dt>Salles</dt>
          <dd>{venuesCount || '—'}</dd>
        </div>
        <div>
          <dt>Pays</dt>
          <dd>{countriesCount || '—'}</dd>
        </div>
      </dl>
    </section>
  )
}

export default MapPreview
