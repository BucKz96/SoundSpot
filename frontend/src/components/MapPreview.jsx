import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import ProviderBadge from './ProviderBadge'

const DEFAULT_CENTER = [20, 0]
const DEFAULT_ZOOM = 2
const MAX_GROUPED_POPUP_EVENTS = 6
const CARTO_DARK_TILES_URL =
  'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'

const GLOBAL_GLOW_POINTS = [
  { latitude: 48.85, longitude: 2.35, color: '#22d3ee', tone: 'cyan', scale: 1.15 },
  { latitude: 51.5, longitude: -0.12, color: '#a78bfa', tone: 'violet', scale: 1.12 },
  { latitude: 52.52, longitude: 13.4, color: '#22d3ee', tone: 'cyan', scale: 0.9 },
  { latitude: 52.37, longitude: 4.9, color: '#e879f9', tone: 'magenta', scale: 0.82 },
  { latitude: 41.39, longitude: 2.17, color: '#e879f9', tone: 'magenta', scale: 0.95 },
  { latitude: 45.46, longitude: 9.19, color: '#67e8f9', tone: 'cyan', scale: 0.78 },
  { latitude: 59.91, longitude: 10.75, color: '#c084fc', tone: 'violet', scale: 0.72 },
  { latitude: 40.71, longitude: -74.01, color: '#22d3ee', tone: 'cyan', scale: 1.18 },
  { latitude: 34.05, longitude: -118.24, color: '#e879f9', tone: 'magenta', scale: 1.08 },
  { latitude: 41.88, longitude: -87.63, color: '#67e8f9', tone: 'cyan', scale: 0.78 },
  { latitude: 25.76, longitude: -80.19, color: '#a78bfa', tone: 'violet', scale: 0.84 },
  { latitude: 19.43, longitude: -99.13, color: '#a78bfa', tone: 'violet', scale: 0.92 },
  { latitude: 45.5, longitude: -73.57, color: '#22d3ee', tone: 'cyan', scale: 0.76 },
  { latitude: -23.55, longitude: -46.63, color: '#a78bfa', tone: 'violet', scale: 1 },
  { latitude: -34.6, longitude: -58.38, color: '#22d3ee', tone: 'cyan', scale: 0.84 },
  { latitude: 35.68, longitude: 139.69, color: '#22d3ee', tone: 'cyan', scale: 1.18 },
  { latitude: 37.57, longitude: 126.98, color: '#e879f9', tone: 'magenta', scale: 0.92 },
  { latitude: 31.23, longitude: 121.47, color: '#67e8f9', tone: 'cyan', scale: 0.86 },
  { latitude: 22.32, longitude: 114.17, color: '#c084fc', tone: 'violet', scale: 0.74 },
  { latitude: 1.35, longitude: 103.82, color: '#a78bfa', tone: 'violet', scale: 0.86 },
  { latitude: 13.75, longitude: 100.5, color: '#e879f9', tone: 'magenta', scale: 0.72 },
  { latitude: 28.61, longitude: 77.21, color: '#22d3ee', tone: 'cyan', scale: 0.78 },
  { latitude: -33.87, longitude: 151.21, color: '#c084fc', tone: 'violet', scale: 1 },
  { latitude: -37.81, longitude: 144.96, color: '#22d3ee', tone: 'cyan', scale: 0.72 },
  { latitude: -1.29, longitude: 36.82, color: '#e879f9', tone: 'magenta', scale: 0.78 },
  { latitude: 25.2, longitude: 55.27, color: '#a78bfa', tone: 'violet', scale: 0.9 },
  { latitude: -33.92, longitude: 18.42, color: '#22d3ee', tone: 'cyan', scale: 0.82 },
]

function getSourceMarkerClass(source) {
  const normalizedSource = (source || '').trim().toLowerCase()

  if (normalizedSource === 'ticketmaster') return 'event-map-marker--ticketmaster'
  if (normalizedSource === 'shotgun') return 'event-map-marker--shotgun'
  return 'event-map-marker--default'
}

function getDominantSource(events) {
  const counts = new Map()

  events.forEach((event) => {
    const source = (event.source || '').trim().toLowerCase()
    if (!source) return
    counts.set(source, (counts.get(source) || 0) + 1)
  })

  let dominantSource = ''
  let dominantCount = 0

  counts.forEach((count, source) => {
    if (count > dominantCount) {
      dominantCount = count
      dominantSource = source
    }
  })

  return dominantSource
}

function createMarkerIcon({ source, isGrouped, isApproximate, count }) {
  const sourceClass = getSourceMarkerClass(source)
  const groupedClass = isGrouped ? 'event-map-marker--grouped' : ''
  const approximateClass = isApproximate ? 'event-map-marker--approximate' : ''
  const size = isGrouped ? 30 : 22
  const anchor = size / 2
  const countLabel = isGrouped && count > 1 ? `<em>${count}</em>` : ''

  return L.divIcon({
    className: `event-map-marker ${sourceClass} ${groupedClass} ${approximateClass}`.trim(),
    html: `<span><b></b><i></i>${countLabel}</span>`,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
    popupAnchor: [0, -anchor],
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
  const venue = (event.venue || '').trim() || 'Venue TBA'

  return (
    <article
      className={`event-map-popup ${
        event.is_location_approximate ? 'event-map-popup--approximate' : ''
      }`}
    >
      <h3>{event.name || 'Untitled event'}</h3>
      <p className="event-map-popup__meta">
        {formatEventTime(event)} · {venue}
      </p>
      {event.is_location_approximate ? (
        <p className="event-map-popup__hint">Approximate city location</p>
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
        <p className="event-map-popup__hint">Approximate city location</p>
      ) : null}
      <ul className="event-map-popup__event-list">
        {visibleEvents.map((event) => {
          const ticketUrl = (event.ticket_url || '').trim()
          const venue = (event.venue || '').trim() || 'Venue TBA'

          return (
            <li key={event.id || `${event.name}-${event.date}`}>
              <h4>{event.name || 'Untitled event'}</h4>
              <p className="event-map-popup__meta">
                {formatEventTime(event)} · {venue}
              </p>
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
        <p className="event-map-popup__hint">
          {remainingEventsCount} more events at this location
        </p>
      ) : null}
    </article>
  )
}

function GlobalGlowMarkers() {
  return GLOBAL_GLOW_POINTS.flatMap((point) => {
    const key = `${point.latitude},${point.longitude}`
    const scale = point.scale || 1

    return [
      <CircleMarker
        key={`${key}-halo`}
        center={[point.latitude, point.longitude]}
        radius={16 * scale}
        pathOptions={{
          stroke: false,
          fillColor: point.color,
          fillOpacity: 0.16,
          className: `global-glow-point global-glow-point--halo global-glow-point--${point.tone}`,
        }}
        interactive={false}
      />,
      <CircleMarker
        key={`${key}-ring`}
        center={[point.latitude, point.longitude]}
        radius={8 * scale}
        pathOptions={{
          color: point.color,
          weight: 1,
          opacity: 0.38,
          fillColor: point.color,
          fillOpacity: 0.1,
          className: `global-glow-point global-glow-point--ring global-glow-point--${point.tone}`,
        }}
        interactive={false}
      />,
      <CircleMarker
        key={`${key}-core`}
        center={[point.latitude, point.longitude]}
        radius={3.4 * scale}
        pathOptions={{
          color: 'rgba(255, 255, 255, 0.68)',
          weight: 1,
          fillColor: point.color,
          fillOpacity: 0.92,
          className: `global-glow-point global-glow-point--core global-glow-point--${point.tone}`,
        }}
        interactive={false}
      />,
    ]
  })
}

function MapAutoFit({ events, hasSearched }) {
  const map = useMap()

  useEffect(() => {
    if (!hasSearched) {
      map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, {
        animate: true,
        duration: 1.1,
      })
      return
    }

    if (events.length === 0) return

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
  }, [events, hasSearched, map])

  return null
}

function MapPreview({ events, loading, hasSearched = false, searchValue = '' }) {
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
  const showGlobalDiscovery = !hasSearched
  const showEmptySearchHint =
    hasSearched && !loading && events.length === 0 && Boolean(searchValue)

  return (
    <section className="map-preview" aria-label="Live event map">
      {showGlobalDiscovery ? (
        <div className="map-preview__header">
          <h2 className="map-preview__title">Global discovery</h2>
          <p className="map-preview__subtitle">
            Search a city or artist to explore live events.
          </p>
        </div>
      ) : null}

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
          <MapAutoFit events={groupedEventLocations} hasSearched={hasSearched} />
          {showGlobalDiscovery ? <GlobalGlowMarkers /> : null}
          {!showGlobalDiscovery
            ? groupedEventLocations.map((group) => {
                const isGrouped = group.events.length > 1
                const dominantSource = getDominantSource(group.events)

                return (
                  <Marker
                    key={group.key}
                    position={[group.latitude, group.longitude]}
                    icon={createMarkerIcon({
                      source: dominantSource,
                      isGrouped,
                      isApproximate: group.isLocationApproximate,
                      count: group.events.length,
                    })}
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
              })
            : null}
        </MapContainer>
        <div className="map-box__overlay" aria-hidden="true" />
        {loading ? (
          <div
            className="map-loading-bar"
            role="status"
            aria-label="Loading events"
            aria-live="polite"
          />
        ) : null}
        {showEmptySearchHint ? (
          <div className="map-box__empty-hint" aria-live="polite">
            <p>No events found for {searchValue}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default MapPreview
