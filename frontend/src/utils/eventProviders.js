const PROVIDERS = {
  ticketmaster: {
    key: 'ticketmaster',
    label: 'Ticketmaster',
    icon: '/providers/ticketmaster.png',
  },
  shotgun: {
    key: 'shotgun',
    label: 'Shotgun',
    icon: '/providers/shotgun.png',
  },
}

export function getEventProvider(source) {
  const normalizedSource = (source || '').trim().toLowerCase()

  if (PROVIDERS[normalizedSource]) {
    return PROVIDERS[normalizedSource]
  }

  return {
    key: 'unknown',
    label: 'Event source',
    icon: '',
  }
}
