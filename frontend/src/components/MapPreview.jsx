import L from 'leaflet'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
} from 'react-leaflet'
import { getEventImageUrl } from '../utils/eventDisplay'
import { groupEventsByVenue } from '../utils/eventGrouping'
import ProviderBadge from './ProviderBadge'
import useEventFavoriteAction from './useEventFavoriteAction'

const DEFAULT_CENTER = [20, 10]
const DEFAULT_ZOOM = 2
const MIN_MAP_ZOOM = 2
const MAX_SIDEBAR_EVENTS = 10
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

function EventThumbnail({ event }) {
  const imageUrl = getEventImageUrl(event)
  const [failedImageUrl, setFailedImageUrl] = useState('')
  const showImage = Boolean(imageUrl) && failedImageUrl !== imageUrl

  return (
    <span
      className={`venue-group-panel__thumbnail ${
        showImage ? 'has-image' : ''
      }`.trim()}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          onError={() => setFailedImageUrl(imageUrl)}
        />
      ) : null}
    </span>
  )
}

function getEventKey(event) {
  return (
    event.id ||
    `${event.name || ''}|${event.date || ''}|${event.venue || ''}|${
      event.source || ''
    }`
  )
}

function SidebarFavoriteButton({ event }) {
  const {
    favorite,
    favoritePending,
    favoriteError,
    toggleFavorite,
  } = useEventFavoriteAction(event)
  const title = (event.name || '').trim() || 'Untitled event'
  const favoriteLabel = favorite
    ? `Remove ${title} from favorites`
    : `Add ${title} to favorites`

  return (
    <div className="venue-group-panel__favorite-wrap">
      <button
        className={[
          'venue-group-panel__favorite',
          favorite ? 'is-favorite' : '',
          favoritePending ? 'is-loading' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        type="button"
        onClick={toggleFavorite}
        disabled={favoritePending}
        aria-pressed={favorite}
        aria-label={favoritePending ? 'Updating favorite' : favoriteLabel}
        title={
          favoritePending
            ? 'Updating favorite'
            : favorite
              ? 'Remove from favorites'
              : 'Add to favorites'
        }
      >
        <span className="venue-group-panel__favorite-spinner" aria-hidden="true" />
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20.6 3.8 13A5.4 5.4 0 0 1 11.4 5.3l.6.7.6-.7a5.4 5.4 0 0 1 7.6 7.7L12 20.6Z" />
        </svg>
      </button>
      {favoriteError ? (
        <p className="venue-group-panel__favorite-error" role="alert">
          {favoriteError}
        </p>
      ) : null}
    </div>
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

const LOCAL_CLUSTER_MIN_ZOOM = 11
const GLOBAL_CLUSTER_MAX_ZOOM = LOCAL_CLUSTER_MIN_ZOOM - 1

function getGlobalClusterCellSize(zoom) {
  if (zoom <= 2) return 92
  if (zoom <= 3) return 82
  if (zoom <= 4) return 72
  if (zoom <= 5) return 62
  if (zoom <= 6) return 54
  if (zoom <= 7) return 46
  if (zoom <= 8) return 38
  if (zoom <= 9) return 32
  return 26
}

function getGlobalClusterIconSize(count) {
  if (count >= 80) return 60
  if (count >= 40) return 54
  if (count >= 18) return 46
  if (count >= 8) return 38
  return 32
}

function createGlobalClusterIcon(cluster, isActive = false) {
  const count = cluster.events.length
  const isCluster = count > 1
  const size = isCluster ? getGlobalClusterIconSize(count) : 18

  return L.divIcon({
    className: [
      'event-map-global-marker',
      isCluster ? 'event-map-global-marker--cluster' : 'event-map-global-marker--ping',
      count >= 40 ? 'event-map-global-marker--large' : '',
      isActive ? 'event-map-global-marker--active' : '',
    ]
      .filter(Boolean)
      .join(' '),
    html: `<span><b></b><i></i>${isCluster ? `<em>${count}</em>` : ''}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function buildGlobalClusters(groups, map, zoom) {
  const cellSize = getGlobalClusterCellSize(zoom)
  const clustersByCell = new Map()

  groups.forEach((group) => {
    const point = map.project([group.latitude, group.longitude], zoom)
    const cellKey = `${Math.floor(point.x / cellSize)}:${Math.floor(
      point.y / cellSize,
    )}`
    const weight = Math.max(group.events.length, 1)
    const existingCluster = clustersByCell.get(cellKey)

    if (existingCluster) {
      existingCluster.latitude += group.latitude * weight
      existingCluster.longitude += group.longitude * weight
      existingCluster.weight += weight
      existingCluster.groupKeys.push(group.key)
      existingCluster.events.push(...group.events)
      return
    }

    clustersByCell.set(cellKey, {
      key: `global:${zoom}:${cellKey}`,
      latitude: group.latitude * weight,
      longitude: group.longitude * weight,
      weight,
      groupKeys: [group.key],
      events: [...group.events],
    })
  })

  return Array.from(clustersByCell.values()).map((cluster) => ({
    ...cluster,
    latitude: cluster.latitude / cluster.weight,
    longitude: cluster.longitude / cluster.weight,
  }))
}

function createVenueIcon(group, isDiscovery, isActive = false, showClusterCount = true) {
  const count = group.events.length
  const sourceClass = getSourceMarkerClass(getGroupSource(group))
  const shouldShowCluster = count > 1 && showClusterCount
  const groupedClass =
    shouldShowCluster
      ? 'event-map-marker--grouped event-map-marker--venue-cluster'
      : ''
  const clusterSizeClass =
    shouldShowCluster && count >= 10
      ? 'event-map-marker--venue-cluster-large'
      : shouldShowCluster && count >= 5
        ? 'event-map-marker--venue-cluster-medium'
        : ''
  const approximateClass = group.isLocationApproximate
    ? 'event-map-marker--approximate'
    : ''
  const discoveryClass = isDiscovery ? 'event-map-marker--discovery' : ''
  const activeClass = isActive ? 'event-map-marker--active' : ''
  const size =
    shouldShowCluster
      ? count >= 10
        ? 31
        : count >= 5
          ? 27
          : 23
      : isDiscovery
        ? 16
        : 20

  return L.divIcon({
    className: [
      'event-map-marker',
      sourceClass,
      groupedClass,
      clusterSizeClass,
      approximateClass,
      discoveryClass,
      activeClass,
    ]
      .filter(Boolean)
      .join(' '),
    html: `<span><b></b><i></i>${shouldShowCluster ? `<em>${count}</em>` : ''}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function VenueMapLayer({
  groups,
  isDiscovery,
  focusedEventKey,
  onVenueSelect,
  onEventOpen,
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())

  useEffect(() => {
    const updateZoom = () => {
      setZoom(map.getZoom())
    }

    updateZoom()
    map.on('zoomend', updateZoom)

    return () => {
      map.off('zoomend', updateZoom)
    }
  }, [map])

  const showLocalClusters = zoom >= LOCAL_CLUSTER_MIN_ZOOM

  if (zoom < LOCAL_CLUSTER_MIN_ZOOM) return null

  return groups.map((group) => {
    return (
      <Marker
        key={group.key}
        position={[group.latitude, group.longitude]}
        icon={createVenueIcon(
          group,
          isDiscovery,
          group.events.some((event) => getEventKey(event) === focusedEventKey),
          showLocalClusters,
        )}
        eventHandlers={{
          click: () => {
            onVenueSelect(group)
            if (group.events.length === 1) {
              onEventOpen?.(group.events[0])
            }
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

function GlobalClusterLayer({
  groups,
  selectedGroupKeys,
  onClusterSelect,
  onEventOpen,
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())

  useEffect(() => {
    const updateZoom = () => {
      setZoom(map.getZoom())
    }

    updateZoom()
    map.on('zoomend', updateZoom)

    return () => {
      map.off('zoomend', updateZoom)
    }
  }, [map])

  const clusters = useMemo(() => {
    if (zoom > GLOBAL_CLUSTER_MAX_ZOOM) return []
    return buildGlobalClusters(groups, map, zoom)
  }, [groups, map, zoom])

  if (zoom > GLOBAL_CLUSTER_MAX_ZOOM) return null

  return clusters.map((cluster) => {
    const isActive = cluster.groupKeys.some((key) => selectedGroupKeys.has(key))
    const isCluster = cluster.events.length > 1

    return (
      <Marker
        key={cluster.key}
        position={[cluster.latitude, cluster.longitude]}
        icon={createGlobalClusterIcon(cluster, isActive)}
        eventHandlers={{
          click: () => {
            onClusterSelect(cluster)
            if (!isCluster) {
              onEventOpen?.(cluster.events[0])
              map.flyTo([cluster.latitude, cluster.longitude], 13, {
                animate: true,
                duration: 0.7,
              })
              return
            }

            const bounds = L.latLngBounds(
              groups
                .filter((group) => cluster.groupKeys.includes(group.key))
                .map((group) => [group.latitude, group.longitude]),
            )

            map.flyToBounds(bounds, {
              animate: true,
              duration: 0.75,
              padding: [54, 54],
              maxZoom: Math.min(zoom + 3, GLOBAL_CLUSTER_MAX_ZOOM + 1),
            })
          },
        }}
        title={`${cluster.events.length} event${
          cluster.events.length === 1 ? '' : 's'
        } in this area`}
      />
    )
  })
}

function getDistanceFromCenter(event, center) {
  const deltaLatitude = Number(event.latitude) - center.lat
  const deltaLongitude = Number(event.longitude) - center.lng

  return Math.hypot(deltaLatitude, deltaLongitude)
}

function MapViewportController({ onViewportChange }) {
  const map = useMap()

  useEffect(() => {
    const updateViewport = () => {
      onViewportChange({
        bounds: map.getBounds(),
        center: map.getCenter(),
        zoom: map.getZoom(),
      })
    }

    updateViewport()
    map.on('moveend zoomend', updateViewport)

    return () => {
      map.off('moveend zoomend', updateViewport)
    }
  }, [map, onViewportChange])

  return null
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
    const frameId = window.requestAnimationFrame(() => {
      map.invalidateSize({ pan: false })

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
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [groups, hasSearched, map])

  return null
}

function MapSizeController({ hasSidebar, hasSearched }) {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()
    const layout = container.closest('.map-layout')
    const resizeTarget = container.parentElement
    let frameId = 0

    const updateMapSize = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        map.invalidateSize({ pan: false })
      })
    }

    updateMapSize()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateMapSize)
      return () => {
        window.cancelAnimationFrame(frameId)
        window.removeEventListener('resize', updateMapSize)
      }
    }

    const observer = new ResizeObserver(updateMapSize)
    if (layout) observer.observe(layout)
    if (resizeTarget) observer.observe(resizeTarget)

    return () => {
      window.cancelAnimationFrame(frameId)
      observer.disconnect()
    }
  }, [hasSidebar, hasSearched, map])

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

function MapLabelDensityController() {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()

    function updateLabelDensity() {
      const zoom = map.getZoom()
      container.classList.toggle('event-map--labels-regional', zoom >= 5)
      container.classList.toggle('event-map--labels-local', zoom >= 9)
    }

    updateLabelDensity()
    map.on('zoomend', updateLabelDensity)

    return () => {
      map.off('zoomend', updateLabelDensity)
      container.classList.remove(
        'event-map--labels-regional',
        'event-map--labels-local',
      )
    }
  }, [map])

  return null
}

function MapEventsPanel({
  title,
  subtitle,
  events,
  selectedEventKey,
  onEventFocus,
  onEventOpen,
  onClear,
  closable = true,
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
        {closable ? (
          <button
            type="button"
            className="venue-group-panel__close"
            onClick={onClear}
            aria-label="Clear map selection"
          >
            x
          </button>
        ) : null}
      </header>
      <ul className="venue-group-panel__events">
        {events.map((event) => {
          const eventUrl = (event.ticket_url || '').trim()
          return (
            <li
              key={event.id || `${event.name}-${event.date}-${event.source}`}
              className={getEventKey(event) === selectedEventKey ? 'is-selected' : ''}
            >
              <EventThumbnail event={event} />
              <button
                type="button"
                className="venue-group-panel__event-focus"
                onClick={() => {
                  onEventFocus(event)
                  onEventOpen?.(event)
                }}
              >
                <h4>{event.name || 'Untitled event'}</h4>
                <p>{formatEventTime(event)}</p>
                <p>
                  {(event.venue || '').trim() || 'Venue TBA'} |{' '}
                  {(event.city || '').trim() || 'City unavailable'}
                </p>
              </button>
              <SidebarFavoriteButton event={event} />
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
  hasActiveFilters = false,
  searchValue = '',
  discoveryError = '',
  onEventOpen,
}) {
  const [mapSelection, setMapSelection] = useState(null)
  const [focusedEventKey, setFocusedEventKey] = useState('')
  const [mapViewport, setMapViewport] = useState(null)
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
      mapSelection
        ? mapSelection.groupKeys
            .map((key) => venueGroups.find((group) => group.key === key))
            .filter(Boolean)
        : [],
    [mapSelection, venueGroups],
  )
  const selectedEvents = useMemo(
    () => selectedGroups.flatMap((group) => group.events),
    [selectedGroups],
  )
  const selectedGroupKeys = useMemo(
    () => new Set(mapSelection?.groupKeys || []),
    [mapSelection],
  )
  const visibleEvents = useMemo(() => {
    if (!mapViewport?.bounds || !mapViewport?.center) {
      return geolocatedEvents.slice(0, MAX_SIDEBAR_EVENTS)
    }

    return geolocatedEvents
      .filter((event) =>
        mapViewport.bounds.contains([event.latitude, event.longitude]),
      )
      .sort(
        (firstEvent, secondEvent) =>
          getDistanceFromCenter(firstEvent, mapViewport.center) -
          getDistanceFromCenter(secondEvent, mapViewport.center),
      )
  }, [geolocatedEvents, mapViewport])
  const panelVisibleEvents = useMemo(
    () => visibleEvents.slice(0, MAX_SIDEBAR_EVENTS),
    [visibleEvents],
  )
  const focusedEvent = useMemo(
    () =>
      geolocatedEvents.find((event) => getEventKey(event) === focusedEventKey) ||
      null,
    [focusedEventKey, geolocatedEvents],
  )
  useEffect(() => {
    const selectionIsEmpty = mapSelection && selectedEvents.length === 0
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
  }, [
    focusedEvent,
    focusedEventKey,
    mapSelection,
    selectedGroups,
    selectedEvents,
  ])
  const panelEvents =
    selectedEvents.length > 0 ? selectedEvents : panelVisibleEvents
  const panelTitle =
    mapSelection?.type === 'venue'
      ? 'Events at this venue'
      : mapSelection?.type === 'global'
        ? 'Events in this area'
        : `${visibleEvents.length} event${
            visibleEvents.length === 1 ? '' : 's'
          } visible`
  const panelSubtitle =
    mapSelection?.type === 'venue'
      ? `${selectedGroups[0]?.venue || 'Venue TBA'} | ${
          selectedGroups[0]?.city || 'City unavailable'
        } | ${selectedEvents.length} event${
          selectedEvents.length === 1 ? '' : 's'
        }`
      : mapSelection?.type === 'global'
        ? `${selectedGroups.length} venue${
            selectedGroups.length === 1 ? '' : 's'
          } clustered | ${selectedEvents.length} event${
            selectedEvents.length === 1 ? '' : 's'
          }`
        : `Showing ${panelEvents.length} nearest event${
            panelEvents.length === 1 ? '' : 's'
          } in this area`
  const handleVenueSelect = useCallback((group) => {
    setMapSelection({ type: 'venue', groupKeys: [group.key] })
    setFocusedEventKey(getEventKey(group.events[0]))
  }, [])
  const handleGlobalClusterSelect = useCallback((cluster) => {
    setMapSelection({ type: 'global', groupKeys: cluster.groupKeys })
    setFocusedEventKey(getEventKey(cluster.events[0]))
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
    showGlobalDiscovery &&
    !hasActiveFilters &&
    !loading &&
    venueGroups.length === 0
  const showDiscoveryLoadingHint =
    showGlobalDiscovery && loading && venueGroups.length === 0
  const showDiscoveryErrorHint =
    showGlobalFallback && !loading && Boolean(discoveryError)
  const showEmptySearchHint =
    hasSearched && !loading && events.length === 0 && Boolean(searchValue)
  const showEmptyDiscoveryFilterHint =
    showGlobalDiscovery &&
    hasActiveFilters &&
    !loading &&
    events.length === 0
  const hasSidebar = panelEvents.length > 0

  return (
    <section className="map-preview" aria-label="Live event map">
      <div className={`map-layout ${hasSidebar ? 'has-sidebar' : ''}`}>
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
              opacity={1}
              subdomains="abcd"
              noWrap
              url={CARTO_DARK_LABELS_TILES_URL}
            />
            <MapSizeController
              hasSidebar={hasSidebar}
              hasSearched={hasSearched}
            />
            <MapViewportController onViewportChange={setMapViewport} />
            <MapAutoFit groups={venueGroups} hasSearched={hasSearched} />
            <MapFocusController event={focusedEvent} />
            <MapLabelDensityController />
            {showGlobalFallback ? <GlobalGlowMarkers /> : null}
            <GlobalClusterLayer
              groups={venueGroups}
              selectedGroupKeys={selectedGroupKeys}
              onClusterSelect={handleGlobalClusterSelect}
              onEventOpen={onEventOpen}
            />
            <VenueMapLayer
              groups={venueGroups}
              isDiscovery={showGlobalDiscovery}
              focusedEventKey={focusedEventKey}
              onVenueSelect={handleVenueSelect}
              onEventOpen={onEventOpen}
            />
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
          {showEmptyDiscoveryFilterHint ? (
            <div className="map-box__empty-hint" aria-live="polite">
              <p>No discovery events match these filters</p>
            </div>
          ) : null}
          {showDiscoveryErrorHint ? (
            <div className="map-box__empty-hint" aria-live="polite">
              <p>Discovery map unavailable. Search to explore events.</p>
            </div>
          ) : null}
        </div>
        <MapEventsPanel
          title={panelTitle}
          subtitle={panelSubtitle}
          events={panelEvents}
          selectedEventKey={focusedEventKey}
          onEventFocus={handleEventFocus}
          onEventOpen={onEventOpen}
          onClear={handleClearSelection}
          closable={Boolean(mapSelection)}
        />
      </div>
    </section>
  )
}

export default MapPreview
