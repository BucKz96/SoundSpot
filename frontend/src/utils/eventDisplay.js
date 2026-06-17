function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function getNestedImageUrl(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    for (const item of value) {
      const imageUrl = getNestedImageUrl(item)
      if (imageUrl) return imageUrl
    }
    return ''
  }
  if (typeof value !== 'object') return ''

  return normalizeText(
    value.url ||
      value.src ||
      value.href ||
      value.image_url ||
      value.imageUrl,
  )
}

export function getEventImageUrl(event) {
  if (!event) return ''

  return (
    normalizeText(event.image_url) ||
    normalizeText(event.imageUrl) ||
    getNestedImageUrl(event.image) ||
    getNestedImageUrl(event.images) ||
    normalizeText(event.thumbnail_url) ||
    normalizeText(event.thumbnailUrl) ||
    getNestedImageUrl(event.thumbnail) ||
    getNestedImageUrl(event.cover) ||
    getNestedImageUrl(event.coverImage) ||
    ''
  )
}

export function getEventTitle(event) {
  return normalizeText(event?.event_name || event?.name || event?.title)
}

export function getEventCity(event) {
  return normalizeText(event?.city)
}

export function getEventCountry(event) {
  return normalizeText(event?.country)
}

export function getEventVenue(event) {
  return normalizeText(event?.venue)
}

export function getEventDate(event) {
  return normalizeText(event?.date)
}

export function getEventTime(event) {
  return normalizeText(event?.time)
}

export function getEventSource(event) {
  return normalizeText(event?.source).toLocaleLowerCase()
}

export function getEventStableKey(event) {
  const source = getEventSource(event)
  const id = normalizeText(event?.event_id || event?.id)
  if (source && id) return `${source}:${id}`

  return [
    getEventTitle(event).toLocaleLowerCase(),
    getEventDate(event),
    getEventVenue(event).toLocaleLowerCase(),
    getEventCity(event).toLocaleLowerCase(),
  ].join('|')
}

function parseEventDate(event) {
  const date = getEventDate(event)
  if (!date) return null

  const parsedDate = new Date(`${date.slice(0, 10)}T00:00:00`)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

export function buildTrendingCities(events, limit = 5) {
  const citiesByKey = new Map()

  events.forEach((event) => {
    const city = getEventCity(event)
    if (!city) return

    const country = getEventCountry(event)
    const key = `${city.toLocaleLowerCase()}|${country.toLocaleLowerCase()}`
    const currentCity = citiesByKey.get(key)

    if (currentCity) {
      currentCity.count += 1
      return
    }

    citiesByKey.set(key, {
      name: city,
      country,
      count: 1,
    })
  })

  return Array.from(citiesByKey.values())
    .sort((firstCity, secondCity) => {
      if (secondCity.count !== firstCity.count) {
        return secondCity.count - firstCity.count
      }
      return firstCity.name.localeCompare(secondCity.name)
    })
    .slice(0, limit)
}

export function buildFeaturedEvents(events, limit = 3) {
  const seenKeys = new Set()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return events
    .filter((event) => getEventTitle(event) && (getEventVenue(event) || getEventCity(event)))
    .filter((event) => {
      const key = getEventStableKey(event)
      if (!key || seenKeys.has(key)) return false
      seenKeys.add(key)
      return true
    })
    .map((event) => {
      const date = parseEventDate(event)
      return {
        event,
        hasImage: Boolean(getEventImageUrl(event)),
        isFuture: date ? date >= today : false,
        dateSort: date ? date.getTime() : Number.MAX_SAFE_INTEGER,
      }
    })
    .sort((firstEvent, secondEvent) => {
      if (firstEvent.hasImage !== secondEvent.hasImage) {
        return firstEvent.hasImage ? -1 : 1
      }
      if (firstEvent.isFuture !== secondEvent.isFuture) {
        return firstEvent.isFuture ? -1 : 1
      }
      return firstEvent.dateSort - secondEvent.dateSort
    })
    .slice(0, limit)
    .map(({ event }) => event)
}
