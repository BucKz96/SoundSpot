const COORDINATE_PRECISION = 4
const UNKNOWN_VENUES = new Set(['', 'tba', 'venue tba', 'unknown venue'])
const WINDOWS_1252_BYTES = new Map([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
])

function repairMojibake(value) {
  let repaired = String(value || '')

  for (
    let attempt = 0;
    attempt < 2 && /[\u00c3\u00c2\u00e2]/.test(repaired);
    attempt += 1
  ) {
    const bytes = []
    let canDecode = true

    for (const character of repaired) {
      const codePoint = character.codePointAt(0)
      const byte = codePoint <= 0xff ? codePoint : WINDOWS_1252_BYTES.get(codePoint)
      if (byte === undefined) {
        canDecode = false
        break
      }
      bytes.push(byte)
    }

    if (!canDecode) break

    let decoded
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(bytes),
      )
    } catch {
      break
    }
    if (decoded === repaired) break
    repaired = decoded
  }

  return repaired
}

function normalizeText(value) {
  return repairMojibake(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normalizeVenueName(value) {
  return normalizeText(value)
}

function getCanonicalVenueName(event) {
  const venue = normalizeVenueName(event.venue)
  const city = normalizeText(event.city)
  if (!venue || !city || venue === city) return venue

  const citySuffix = ` ${city}`
  if (venue.endsWith(citySuffix)) {
    const withoutCity = venue.slice(0, -citySuffix.length).trim()
    if (withoutCity.split(' ').length >= 2) return withoutCity
  }

  return venue
}

export function getCoordinateGroupKey(event) {
  const latitude = Number(event.latitude)
  const longitude = Number(event.longitude)

  return `${latitude.toFixed(COORDINATE_PRECISION)},${longitude.toFixed(
    COORDINATE_PRECISION,
  )}`
}

export function getVenueKey(event) {
  const venue = getCanonicalVenueName(event)
  const city = normalizeText(event.city)

  if (!UNKNOWN_VENUES.has(venue) && city) {
    return `venue:${venue}|${city}`
  }

  if (!UNKNOWN_VENUES.has(venue)) {
    return `venue:${venue}|coordinates:${getCoordinateGroupKey(event)}`
  }

  return `coordinates:${getCoordinateGroupKey(event)}`
}

function getVenueLabel(events) {
  const venueCounts = new Map()

  events.forEach((event) => {
    const venue = (event.venue || '').trim()
    if (UNKNOWN_VENUES.has(normalizeVenueName(venue))) return
    venueCounts.set(venue, (venueCounts.get(venue) || 0) + 1)
  })

  return (
    Array.from(venueCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ||
    'Venue TBA'
  )
}

export function groupEventsByVenue(events) {
  const groups = []
  const groupsByVenue = new Map()
  const groupsByCoordinates = new Map()

  events.forEach((event) => {
    const latitude = Number(event.latitude)
    const longitude = Number(event.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

    const venueKey = getVenueKey(event)
    const coordinateKey = getCoordinateGroupKey(event)
    const hasNamedVenue = venueKey.startsWith('venue:')
    const existingGroup = hasNamedVenue
      ? groupsByVenue.get(venueKey)
      : groupsByCoordinates.get(coordinateKey)

    if (existingGroup) {
      existingGroup.events.push(event)
      existingGroup.isLocationApproximate =
        existingGroup.isLocationApproximate || Boolean(event.is_location_approximate)
      return
    }

    const group = {
      key: venueKey,
      latitude,
      longitude,
      city: (event.city || '').trim(),
      isLocationApproximate: Boolean(event.is_location_approximate),
      events: [event],
    }

    groups.push(group)
    if (hasNamedVenue) {
      groupsByVenue.set(venueKey, group)
    } else {
      groupsByCoordinates.set(coordinateKey, group)
    }
  })

  return groups.map((group) => ({
    ...group,
    venue: getVenueLabel(group.events),
  }))
}

export function groupEventsByCoordinates(events) {
  const groups = new Map()

  events.forEach((event) => {
    const latitude = Number(event.latitude)
    const longitude = Number(event.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

    const key = getCoordinateGroupKey(event)
    const existingGroup = groups.get(key)

    if (existingGroup) {
      existingGroup.events.push(event)
      existingGroup.isLocationApproximate =
        existingGroup.isLocationApproximate || Boolean(event.is_location_approximate)
      return
    }

    groups.set(key, {
      key: `coordinates:${key}`,
      latitude,
      longitude,
      city: (event.city || '').trim(),
      venue: getVenueLabel([event]),
      isLocationApproximate: Boolean(event.is_location_approximate),
      events: [event],
    })
  })

  return Array.from(groups.values())
}
