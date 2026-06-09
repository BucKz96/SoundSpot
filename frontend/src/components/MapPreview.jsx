import L from 'leaflet'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { groupEventsByVenue } from '../utils/eventGrouping'
import ProviderBadge from './ProviderBadge'

const DEFAULT_CENTER = [20, 0]
const DEFAULT_ZOOM = 2
const MIN_MAP_ZOOM = 2
const DISABLE_CLUSTERING_AT_ZOOM = 15
const MAX_CLUSTER_RADIUS = 80
const WORLD_BOUNDS = [
  [-85, -180],
  [85, 180],
]
const CARTO_DARK_BASE_TILES_URL =
  'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
const CARTO_DARK_LABELS_TILES_URL =
  'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png'

const GLOBAL_GLOW_POINTS = [
  [48.85, 2.35, '#22d3ee'],
  [51.5, -0.12, '#a78bfa'],
  [52.52, 13.4, '#22d3ee'],
  [52.37, 4.9, '#e879f9'],
  [41.39, 2.17, '#e879f9'],
  [45.46, 9.19, '#67e8f9'],
  [40.71, -74.01, '#22d3ee'],
  [34.05, -118.24, '#e879f9'],
  [19.43, -99.13, '#a78bfa'],
  [-23.55, -46.63, '#a78bfa'],
  [35.68, 139.69, '#22d3ee'],
  [37.57, 126.98, '#e879f9'],
  [-33.87, 151.21, '#c084fc'],
]

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

  if (date && time) return `${date} | ${time}`
  return date || time || 'Date TBA'
}

function getEventKey(event) {
  return (
    event.id ||
    `${event.name || ''}|${event.date || ''}|${event.venue || ''}|${
      event.source || ''
    }`
  )
}

function getSourceMarkerClass(source) {
  const normalizedSource = (source || '').trim().toLowerCase()

  if (normalizedSource === 'ticketmaster') return 'event-map-marker--ticketmaster'
  if (normalizedSource === 'shotgun') return 'event-map-marker--shotgun'
  if (normalizedSource === 'openagenda') return 'event-map-marker--openagenda'
  return 'event-map-marker--default'
}

function getGroupSource(group) {
  const sources = new Set(
    group.events
      .map((event) => (event.source || '').trim().toLowerCase())
      .filter(Boolean),
  )

  return sources.size === 1 ? Array.from(sources)[0] : ''
}

function createVenueIcon(group, isDiscovery) {
  const count = group.events.length
  const sourceClass = getSourceMarkerClass(getGroupSource(group))
  const groupedClass =
    count > 1
      ? 'event-map-marker--grouped event-map-marker--venue-cluster'
      : ''
  const approximateClass = group.isLocationApproximate
    ? 'event-map-marker--approximate'
    : ''
  const discoveryClass = isDiscovery ? 'event-map-marker--discovery' : ''
  const size = isDiscovery ? (count > 1 ? 24 : 18) : count > 1 ? 34 : 26

  return L.divIcon({
    className: [
      'event-map-marker',
      sourceClass,
      groupedClass,
      approximateClass,
      discoveryClass,
    ]
      .filter(Boolean)
      .join(' '),
    html: `<span><b></b><i></i>${count > 1 ? `<em>${count}</em>` : ''}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function createClusterIcon(eventCount) {
  const sizeClass =
    eventCount >= 50 ? 'large' : eventCount >= 10 ? 'medium' : 'small'
  const size = eventCount >= 50 ? 52 : eventCount >= 10 ? 46 : 40

  return L.divIcon({
    className: `event-map-cluster event-map-cluster--${sizeClass}`,
    html: `<span>${eventCount}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function clusterVenueGroups(groups, map, zoom) {
  if (zoom >= DISABLE_CLUSTERING_AT_ZOOM) {
    return groups.map((group) => ({
      key: group.key,
      type: 'venue',
      latitude: group.latitude,
      longitude: group.longitude,
      groups: [group],
      eventCount: group.events.length,
    }))
  }

  const clusters = []

  groups.forEach((group) => {
    const point = map.project([group.latitude, group.longitude], zoom)
    const nearbyCluster = clusters.find((cluster) => {
      const deltaX = cluster.point.x - point.x
      const deltaY = cluster.point.y - point.y
      return Math.hypot(deltaX, deltaY) <= MAX_CLUSTER_RADIUS
    })

    if (nearbyCluster) {
      nearbyCluster.groups.push(group)
      nearbyCluster.eventCount += group.events.length
      const groupCount = nearbyCluster.groups.length
      nearbyCluster.point = L.point(
        (nearbyCluster.point.x * (groupCount - 1) + point.x) / groupCount,
        (nearbyCluster.point.y * (groupCount - 1) + point.y) / groupCount,
      )
      const center = map.unproject(nearbyCluster.point, zoom)
      nearbyCluster.latitude = center.lat
      nearbyCluster.longitude = center.lng
      return
    }

    clusters.push({
      key: `cluster:${group.key}`,
      type: 'cluster',
      latitude: group.latitude,
      longitude: group.longitude,
      point,
      groups: [group],
      eventCount: group.events.length,
    })
  })

  return clusters.map((cluster) => ({
    ...cluster,
    type: cluster.groups.length > 1 ? 'cluster' : 'venue',
  }))
}

function VenueMapLayer({ groups, isDiscovery, onClusterSelect, onVenueSelect }) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())

  useMapEvents({
    zoomend() {
      const nextZoom = map.getZoom()
      setZoom((currentZoom) => (currentZoom === nextZoom ? currentZoom : nextZoom))
    },
  })

  const visibleMarkers = useMemo(
    () => clusterVenueGroups(groups, map, zoom),
    [groups, map, zoom],
  )

  return visibleMarkers.map((item) => {
    if (item.type === 'cluster') {
      const bounds = L.latLngBounds(
        item.groups.map((group) => [group.latitude, group.longitude]),
      )
      return (
        <Marker
          key={`${item.key}:${zoom}`}
          position={[item.latitude, item.longitude]}
          icon={createClusterIcon(item.eventCount)}
          eventHandlers={{
            click: () => {
              onClusterSelect(item.groups)
              map.flyToBounds(bounds, {
                animate: true,
                duration: 0.7,
                padding: [32, 32],
                maxZoom: Math.min(zoom + 3, DISABLE_CLUSTERING_AT_ZOOM),
              })
            },
          }}
          title={`${item.eventCount} events`}
        />
      )
    }

    const group = item.groups[0]
    return (
      <Marker
        key={group.key}
        position={[group.latitude, group.longitude]}
        icon={createVenueIcon(group, isDiscovery)}
        eventHandlers={{
          click: () => {
            onVenueSelect(group)
            if (map.getZoom() < 13) {
              map.flyTo([group.latitude, group.longitude], 14, {
                animate: true,
                duration: 0.65,
              })
            } else {
              map.panTo([group.latitude, group.longitude], {
                animate: true,
                duration: 0.45,
              })
            }
          },
        }}
        title={`${group.venue}: ${group.events.length} event${
          group.events.length === 1 ? '' : 's'
        }`}
      />
    )
  })
}

function GlobalGlowMarkers() {
  return GLOBAL_GLOW_POINTS.map(([latitude, longitude, color]) => (
    <CircleMarker
      key={`${latitude},${longitude}`}
      center={[latitude, longitude]}
      radius={5}
      pathOptions={{
        color,
        weight: 1,
        opacity: 0.42,
        fillColor: color,
        fillOpacity: 0.2,
        className: 'global-glow-point global-glow-point--core',
      }}
      interactive={false}
    />
  ))
}

function MapAutoFit({ groups, hasSearched }) {
  const map = useMap()

  useEffect(() => {
    if (!hasSearched) {
      map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, {
        animate: true,
        duration: 1.1,
      })
      return
    }

    if (groups.length === 0) return

    if (groups.length === 1) {
      map.flyTo([groups[0].latitude, groups[0].longitude], 12, {
        animate: true,
        duration: 1.2,
      })
      return
    }

    const bounds = L.latLngBounds(
      groups.map((group) => [group.latitude, group.longitude]),
    )
    map.flyToBounds(bounds, {
      animate: true,
      duration: 1.35,
      padding: [36, 36],
      maxZoom: 12,
    })
  }, [groups, hasSearched, map])

  return null
}

function MapFocusController({ event }) {
  const map = useMap()

  useEffect(() => {
    if (!event || !isValidCoordinate(event.latitude, event.longitude)) return

    map.flyTo([Number(event.latitude), Number(event.longitude)], 15, {
      animate: true,
      duration: 0.85,
    })
  }, [event, map])

  return null
}

function MapEventsPanel({
  title,
  subtitle,
  events,
  selectedEventKey,
  onEventFocus,
  onClear,
}) {
  if (events.length === 0) return null

  return (
    <aside className="venue-group-panel" aria-label={title}>
      <header className="venue-group-panel__header">
        <div>
          <p className="venue-group-panel__eyebrow">
            {events.length} event{events.length === 1 ? '' : 's'}
          </p>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <button
          type="button"
          className="venue-group-panel__close"
          onClick={onClear}
          aria-label="Clear map selection"
        >
          x
        </button>
      </header>
      <ul className="venue-group-panel__events">
        {events.map((event) => {
          const eventUrl = (event.ticket_url || '').trim()
          return (
            <li
              key={event.id || `${event.name}-${event.date}-${event.source}`}
              className={getEventKey(event) === selectedEventKey ? 'is-selected' : ''}
            >
              <button
                type="button"
                className="venue-group-panel__event-focus"
                onClick={() => onEventFocus(event)}
              >
                <h4>{event.name || 'Untitled event'}</h4>
                <p>{formatEventTime(event)}</p>
                <p>
                  {(event.venue || '').trim() || 'Venue TBA'} |{' '}
                  {(event.city || '').trim() || 'City unavailable'}
                </p>
              </button>
              <ProviderBadge
                source={event.source}
                href={eventUrl}
                compact
                unavailable={!eventUrl}
              />
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

function MapPreview({
  events,
  loading,
  hasSearched = false,
  searchValue = '',
  discoveryError = '',
}) {
  const [mapSelection, setMapSelection] = useState(null)
  const [focusedEventKey, setFocusedEventKey] = useState('')
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
  const venueGroups = useMemo(
    () => groupEventsByVenue(geolocatedEvents),
    [geolocatedEvents],
  )
  const selectedGroups = useMemo(
    () =>
      mapSelection?.groupKeys
        .map((key) => venueGroups.find((group) => group.key === key))
        .filter(Boolean) || [],
    [mapSelection, venueGroups],
  )
  const selectedEvents = useMemo(
    () => selectedGroups.flatMap((group) => group.events),
    [selectedGroups],
  )
  const focusedEvent = useMemo(
    () =>
      selectedEvents.find((event) => getEventKey(event) === focusedEventKey) ||
      null,
    [focusedEventKey, selectedEvents],
  )
  useEffect(() => {
    const selectionIsEmpty = mapSelection && selectedGroups.length === 0
    const selectionShrank =
      mapSelection && selectedGroups.length !== mapSelection.groupKeys.length
    const focusedEventWasFilteredOut = focusedEventKey && !focusedEvent

    if (!selectionIsEmpty && !selectionShrank && !focusedEventWasFilteredOut) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      if (selectionIsEmpty) {
        setMapSelection(null)
      } else if (selectionShrank) {
        setMapSelection((selection) => ({
          ...selection,
          groupKeys: selectedGroups.map((group) => group.key),
        }))
      }

      if (selectionIsEmpty || focusedEventWasFilteredOut) {
        setFocusedEventKey('')
      }
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [focusedEvent, focusedEventKey, mapSelection, selectedGroups])
  const panelTitle =
    mapSelection?.type === 'cluster'
      ? 'Events in this area'
      : selectedGroups[0]?.venue || 'Events at this venue'
  const panelSubtitle =
    mapSelection?.type === 'cluster'
      ? `${selectedGroups.length} venues`
      : `${selectedGroups[0]?.city || 'City unavailable'} | ${
          selectedEvents.length
        } event${selectedEvents.length === 1 ? '' : 's'} at this venue`
  const handleClusterSelect = useCallback((groups) => {
    setMapSelection({
      type: 'cluster',
      groupKeys: groups.map((group) => group.key),
    })
    setFocusedEventKey('')
  }, [])
  const handleVenueSelect = useCallback((group) => {
    setMapSelection({ type: 'venue', groupKeys: [group.key] })
    setFocusedEventKey('')
  }, [])
  const handleEventFocus = useCallback((event) => {
    if (!isValidCoordinate(event.latitude, event.longitude)) return
    setFocusedEventKey(getEventKey(event))
  }, [])
  const handleClearSelection = useCallback(() => {
    setMapSelection(null)
    setFocusedEventKey('')
  }, [])

  const showGlobalDiscovery = !hasSearched
  const showGlobalFallback =
    showGlobalDiscovery && !loading && venueGroups.length === 0
  const showDiscoveryLoadingHint =
    showGlobalDiscovery && loading && venueGroups.length === 0
  const showDiscoveryErrorHint =
    showGlobalFallback && !loading && Boolean(discoveryError)
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
          minZoom={MIN_MAP_ZOOM}
          maxBounds={WORLD_BOUNDS}
          maxBoundsViscosity={1}
          scrollWheelZoom
          dragging
          worldCopyJump={false}
          className="event-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            className="event-map__base-tiles"
            subdomains="abcd"
            noWrap
            url={CARTO_DARK_BASE_TILES_URL}
          />
          <TileLayer
            className="event-map__label-tiles"
            maxZoom={6}
            opacity={0.34}
            subdomains="abcd"
            noWrap
            url={CARTO_DARK_LABELS_TILES_URL}
          />
          <MapAutoFit groups={venueGroups} hasSearched={hasSearched} />
          <MapFocusController event={focusedEvent} />
          {showGlobalFallback ? <GlobalGlowMarkers /> : null}
          <VenueMapLayer
            groups={venueGroups}
            isDiscovery={showGlobalDiscovery}
            onClusterSelect={handleClusterSelect}
            onVenueSelect={handleVenueSelect}
          />
        </MapContainer>
        <div className="map-box__overlay" aria-hidden="true" />
        <MapEventsPanel
          title={panelTitle}
          subtitle={panelSubtitle}
          events={selectedEvents}
          selectedEventKey={focusedEventKey}
          onEventFocus={handleEventFocus}
          onClear={handleClearSelection}
        />
        {loading ? (
          <div
            className="map-loading-bar"
            role="status"
            aria-label="Loading events"
            aria-live="polite"
          />
        ) : null}
        {showDiscoveryLoadingHint ? (
          <div
            className="map-box__empty-hint map-box__empty-hint--loading"
            aria-live="polite"
          >
            <p>Loading live events...</p>
          </div>
        ) : null}
        {showEmptySearchHint ? (
          <div className="map-box__empty-hint" aria-live="polite">
            <p>No events found for {searchValue}</p>
          </div>
        ) : null}
        {showDiscoveryErrorHint ? (
          <div className="map-box__empty-hint" aria-live="polite">
            <p>Discovery map unavailable. Search to explore events.</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default MapPreview
