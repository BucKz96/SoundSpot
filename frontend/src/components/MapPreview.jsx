import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import ProviderBadge from './ProviderBadge'

const DEFAULT_CENTER = [20, 0]
const DEFAULT_ZOOM = 2
const MAX_GROUPED_POPUP_EVENTS = 6
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

const approximateMarkerIcon = L.divIcon({
  className: 'event-map-marker event-map-marker--approximate',
  html: '<span></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -13],
})

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

function getCoordinateKey(event) {
  return `${event.latitude.toFixed(6)},${event.longitude.toFixed(6)}`
}

function groupEventsByCoordinates(events) {
  const groups = new Map()

  events.forEach((event) => {
    const key = getCoordinateKey(event)
    const existingGroup = groups.get(key)

    if (existingGroup) {
      existingGroup.events.push(event)
      existingGroup.isLocationApproximate =
        existingGroup.isLocationApproximate || event.is_location_approximate
      return
    }

    groups.set(key, {
      key,
      latitude: event.latitude,
      longitude: event.longitude,
      isLocationApproximate: Boolean(event.is_location_approximate),
      events: [event],
    })
  })

  return Array.from(groups.values())
}

function SingleEventPopup({ event }) {
  const ticketUrl = (event.ticket_url || '').trim()

  return (
    <article
      className={`event-map-popup ${
        event.is_location_approximate ? 'event-map-popup--approximate' : ''
      }`}
    >
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
      {event.is_location_approximate ? (
        <p>Approximate city location</p>
      ) : null}
      <ProviderBadge
        source={event.source}
        href={ticketUrl}
        compact
        unavailable={!ticketUrl}
      />
    </article>
  )
}

function GroupedEventsPopup({ events, isLocationApproximate }) {
  const visibleEvents = events.slice(0, MAX_GROUPED_POPUP_EVENTS)
  const remainingEventsCount = events.length - visibleEvents.length
  const eventLabel = events.length === 1 ? 'event' : 'events'

  return (
    <article
      className={`event-map-popup event-map-popup--group ${
        isLocationApproximate ? 'event-map-popup--approximate' : ''
      }`}
    >
      <h3>
        {events.length} {eventLabel} at this location
      </h3>
      {isLocationApproximate ? (
        <p>Approximate city location</p>
      ) : null}
      <ul className="event-map-popup__event-list">
        {visibleEvents.map((event) => {
          const ticketUrl = (event.ticket_url || '').trim()

          return (
            <li key={event.id || `${event.name}-${event.date}`}>
              <h4>{event.name || 'Untitled event'}</h4>
              {event.artist ? (
                <p className="event-map-popup__artist">{event.artist}</p>
              ) : null}
              <p>{formatEventTime(event)}</p>
              <ProviderBadge
                source={event.source}
                href={ticketUrl}
                compact
                unavailable={!ticketUrl}
              />
            </li>
          )
        })}
      </ul>
      {remainingEventsCount > 0 ? (
        <p>{remainingEventsCount} more events at this location</p>
      ) : null}
    </article>
  )
}

function MapAutoFit({ events }) {
  const map = useMap()

  useEffect(() => {
    if (events.length === 0) {
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
  }, [events, map])

  return null
}

function MapPreview({ events, loading, searchedCity, searchLabel }) {
  const activeSearchLabel = searchLabel || searchedCity || 'Global search'
  const eventsLabel = events.length === 1 ? 'event' : 'events'
  const countLabel = loading ? 'Searching events...' : `${events.length} ${eventsLabel} found`
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
  const groupedEventLocations = useMemo(
    () => groupEventsByCoordinates(geolocatedEvents),
    [geolocatedEvents],
  )

  return (
    <section className="map-preview" aria-label="Live event map">
      <div className="map-preview__header">
        <p className="map-preview__eyebrow">Live map</p>
        <h2>{activeSearchLabel}</h2>
        <p className="map-preview__count">{countLabel}</p>
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
          <MapAutoFit events={groupedEventLocations} />
          {groupedEventLocations.map((group) => {
            return (
              <Marker
                key={group.key}
                position={[group.latitude, group.longitude]}
                icon={group.isLocationApproximate ? approximateMarkerIcon : markerIcon}
              >
                <Popup>
                  {group.events.length === 1 ? (
                    <SingleEventPopup event={group.events[0]} />
                  ) : (
                    <GroupedEventsPopup
                      events={group.events}
                      isLocationApproximate={group.isLocationApproximate}
                    />
                  )}
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

      <div className="map-preview__tools" aria-hidden="true" />
    </section>
  )
}

export default MapPreview
