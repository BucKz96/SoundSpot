import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'

const DEFAULT_CENTER = [20, 0]
const DEFAULT_ZOOM = 2
const CARTO_DARK_TILES_URL =
  'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
// Swap to dark_all if city and street labels are needed later.
// const CARTO_DARK_TILES_URL =
//   'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'

const markerIcon = L.divIcon({
  className: 'event-map-marker',
  html: '<span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12],
})

function getKnownValues(events, field) {
  return new Set(events.map((event) => (event[field] || '').trim()).filter(Boolean))
}

function getNextDate(events) {
  const dates = events
    .map((event) => (event.date || '').trim())
    .filter(Boolean)
    .sort()

  const nextDate = dates[0]
  if (!nextDate) return 'To be confirmed'

  const parsedDate = new Date(`${nextDate}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime())) return nextDate

  return parsedDate.toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function isValidCoordinate(latitude, longitude) {
  const lat = Number(latitude)
  const lng = Number(longitude)

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  )
}

function getLocationLabel(event) {
  const city = (event.city || '').trim()
  const country = (event.country || '').trim()

  if (city && country) return `${city}, ${country}`
  if (city) return city
  if (country) return country
  return 'Location TBA'
}

function formatEventTime(event) {
  const date = (event.date || '').trim()
  const time = (event.time || '').trim()

  if (date && time) return `${date} · ${time}`
  return date || time || 'Date TBA'
}

function MapAutoFit({ events }) {
  const map = useMap()

  useEffect(() => {
    if (events.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
      return
    }

    if (events.length === 1) {
      map.setView([events[0].latitude, events[0].longitude], 12)
      return
    }

    const bounds = L.latLngBounds(
      events.map((event) => [event.latitude, event.longitude]),
    )

    map.fitBounds(bounds, {
      padding: [36, 36],
      maxZoom: 12,
    })
  }, [events, map])

  return null
}

function MapPreview({ events, loading, searchedCity }) {
  const venuesCount = getKnownValues(events, 'venue').size
  const countriesCount = getKnownValues(events, 'country').size
  const activeCity = searchedCity || 'Global search'
  const nextDate = loading ? 'Loading...' : getNextDate(events)
  const eventsLabel = events.length > 1 ? 'concerts' : 'concert'
  const countLabel = loading ? 'Searching...' : `${events.length} ${eventsLabel}`
  const emptyMapTitle = loading ? 'Loading event locations...' : 'No geolocated events yet'
  const emptyMapMessage = loading
    ? 'The map will update as soon as events with coordinates are available.'
    : searchedCity
      ? 'Search another city or try again when event coordinates are available.'
      : 'Search a city to display event locations on the map.'
  const geolocatedEvents = useMemo(
    () =>
      events
        .filter((event) => isValidCoordinate(event.latitude, event.longitude))
        .map((event) => ({
          ...event,
          latitude: Number(event.latitude),
          longitude: Number(event.longitude),
        })),
    [events],
  )

  return (
    <section className="map-preview" aria-label="Concert overview">
      <div className="map-preview__header">
        <div>
          <p className="map-preview__eyebrow">Overview</p>
          <h2>{activeCity}</h2>
        </div>
        <span className="map-preview__count">{countLabel}</span>
      </div>

      <div className="map-box">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom={false}
          className="event-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains="abcd"
            url={CARTO_DARK_TILES_URL}
          />
          <MapAutoFit events={geolocatedEvents} />
          {geolocatedEvents.map((event) => {
            const ticketUrl = (event.ticket_url || '').trim()

            return (
              <Marker
                key={event.id}
                position={[event.latitude, event.longitude]}
                icon={markerIcon}
              >
                <Popup>
                  <article className="event-map-popup">
                    <h3>{event.name || 'Untitled event'}</h3>
                    {event.artist ? (
                      <p className="event-map-popup__artist">{event.artist}</p>
                    ) : null}
                    <dl>
                      <div>
                        <dt>Venue</dt>
                        <dd>{event.venue || 'Venue TBA'}</dd>
                      </div>
                      <div>
                        <dt>City</dt>
                        <dd>{getLocationLabel(event)}</dd>
                      </div>
                      <div>
                        <dt>Time</dt>
                        <dd>{formatEventTime(event)}</dd>
                      </div>
                    </dl>
                    {ticketUrl ? (
                      <a href={ticketUrl} target="_blank" rel="noreferrer">
                        View tickets
                      </a>
                    ) : null}
                  </article>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
        {geolocatedEvents.length === 0 ? (
          <div className="map-box__empty" role="status">
            <span>{emptyMapTitle}</span>
            <p>{emptyMapMessage}</p>
          </div>
        ) : null}
      </div>

      <dl className="map-preview__stats">
        <div>
          <dt>Next date</dt>
          <dd>{nextDate}</dd>
        </div>
        <div>
          <dt>Venues</dt>
          <dd>{venuesCount || '—'}</dd>
        </div>
        <div>
          <dt>Countries</dt>
          <dd>{countriesCount || '—'}</dd>
        </div>
      </dl>
    </section>
  )
}

export default MapPreview
