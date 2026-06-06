import { getEventProvider } from '../utils/eventProviders'

function getProviderActionLabel(provider) {
  if (provider.key === 'ticketmaster') return 'Open event on Ticketmaster'
  if (provider.key === 'shotgun') return 'Open event on Shotgun'
  if (provider.key === 'openagenda') return 'Open event on OpenAgenda'
  return 'Open event source'
}

function ProviderBadge({ source, compact = false, href = '', unavailable = false }) {
  const provider = getEventProvider(source)
  const isLink = Boolean(href)
  const className = [
    'provider-badge',
    `provider-badge--${provider.key}`,
    compact ? 'provider-badge--compact' : '',
    isLink ? 'provider-badge--link' : '',
    unavailable ? 'provider-badge--unavailable' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const label = unavailable ? 'Source unavailable' : provider.label
  const content = (
    <>
      {provider.icon ? (
        <img
          className="provider-badge__icon"
          src={provider.icon}
          alt=""
          aria-hidden="true"
          onError={(event) => {
            if (
              provider.fallbackIcon &&
              event.currentTarget.src !== new URL(provider.fallbackIcon, window.location.origin).href
            ) {
              event.currentTarget.src = provider.fallbackIcon
              return
            }
            event.currentTarget.hidden = true
          }}
        />
      ) : null}
      <span className="provider-badge__label">{label}</span>
      {isLink ? (
        <span className="provider-badge__external" aria-hidden="true">
          ↗
        </span>
      ) : null}
    </>
  )

  if (isLink) {
    return (
      <a
        className={className}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={getProviderActionLabel(provider)}
        title={getProviderActionLabel(provider)}
      >
        {content}
      </a>
    )
  }

  return (
    <span
      className={className}
      title={unavailable ? 'Source unavailable' : `Source: ${provider.label}`}
      aria-label={unavailable ? 'Source unavailable' : `Source: ${provider.label}`}
    >
      {content}
    </span>
  )
}

export default ProviderBadge
