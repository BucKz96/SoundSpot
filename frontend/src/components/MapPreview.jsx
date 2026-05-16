import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'

const DEFAULT_CENTER = [20, 0]
const DEFAULT_ZOOM = 2
const CITY_FALLBACK_ZOOM = 10
const CARTO_DARK_TILES_URL =
  'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
// Swap to dark_all if city and street labels are needed later.
// const CARTO_DARK_TILES_URL =
//   'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'

const CITY_COORDINATES = {
  amsterdam: { label: 'Amsterdam', latitude: 52.3676, longitude: 4.9041 },
  barcelona: { label: 'Barcelona', latitude: 41.3874, longitude: 2.1686 },
  berlin: { label: 'Berlin', latitude: 52.52, longitude: 13.405 },
  london: { label: 'London', latitude: 51.5072, longitude: -0.1276 },
  londres: { label: 'London', latitude: 51.5072, longitude: -0.1276 },
  lyon: { label: 'Lyon', latitude: 45.764, longitude: 4.8357 },
  madrid: { label: 'Madrid', latitude: 40.4168, longitude: -3.7038 },
  marseille: { label: 'Marseille', latitude: 43.2965, longitude: 5.3698 },
  paris: { label: 'Paris', latitude: 48.8566, longitude: 2.3522 },
  rome: { label: 'Rome', latitude: 41.9028, longitude: 12.4964 },
}

const markerIcon = L.divIcon({
  className: 'event-map-marker',
  html: '<span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12],
})

const approximateMarkerIcon = L.divIcon({
  className: 'event-map-marker event-map-marker--approximate',
  html: '<span></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -13],
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

function normalizeCityName(city) {
  return city
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function getCityFallback(city) {
  return CITY_COORDINATES[normalizeCityName(city)]
}

function MapAutoFit({ events, fallbackLocation }) {
  const map = useMap()

  useEffect(() => {
    if (events.length === 0) {
      if (fallbackLocation) {
        map.flyTo(
          [fallbackLocation.latitude, fallbackLocation.longitude],
          CITY_FALLBACK_ZOOM,
          {
            animate: true,
            duration: 1.2,
          },
        )
        return
      }

      map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, {
        animate: true,
        duration: 1.1,
      })
      return
    }

    if (events.length === 1) {
      map.flyTo([events[0].latitude, events[0].longitude], 12, {
        animate: true,
        duration: 1.2,
      })
      return
    }

    const bounds = L.latLngBounds(
      events.map((event) => [event.latitude, event.longitude]),
    )

    map.flyToBounds(bounds, {
      animate: true,
      duration: 1.35,
      padding: [36, 36],
      maxZoom: 12,
    })
  }, [events, fallbackLocation, map])

  return null
}

function MapPreview({ events, loading, searchedCity }) {
  const venuesCount = getKnownValues(events, 'venue').size
  const countriesCount = getKnownValues(events, 'country').size
  const activeCity = searchedCity || 'Global search'
  const nextDate = loading ? 'Loading...' : getNextDate(events)
  const eventsLabel = events.length === 1 ? 'concert' : 'concerts'
  const countLabel = loading ? 'Searching...' : `${events.length} ${eventsLabel}`
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
  const fallbackLocation = useMemo(() => {
    if (events.length === 0 || geolocatedEvents.length > 0 || !searchedCity) {
      return null
    }

    return getCityFallback(searchedCity) || null
  }, [events.length, geolocatedEvents.length, searchedCity])

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
          <MapAutoFit events={geolocatedEvents} fallbackLocation={fallbackLocation} />
          {fallbackLocation ? (
            <Marker
              icon={approximateMarkerIcon}
              position={[fallbackLocation.latitude, fallbackLocation.longitude]}
            >
              <Popup>
                <article className="event-map-popup event-map-popup--approximate">
                  <h3>{fallbackLocation.label}</h3>
                  <p className="event-map-popup__artist">Approximate city location</p>
                  <p>
                    Exact venue coordinates are not available for these events.
                  </p>
                </article>
              </Popup>
            </Marker>
          ) : null}
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
        {loading ? (
          <div
            className="map-loading-bar"
            role="status"
            aria-label="Loading events"
            aria-live="polite"
          />
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
