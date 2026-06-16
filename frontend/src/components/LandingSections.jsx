import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import logo from '../assets/soundspot-logo.png'
import { howItWorksSteps } from '../data/landingData'
import {
  mockFeaturedEvents,
  mockFutureSources,
  mockTrendingCities,
} from '../data/landingMockData'
import { useFavorites } from '../favorites/useFavorites'
import ProviderBadge from './ProviderBadge'

function getEventImage(event) {
  return (
    event.image_url ||
    event.image ||
    event.thumbnail_url ||
    event.thumbnail ||
    ''
  )
}

function formatFeaturedDate(value) {
  if (!value) return 'Date TBA'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function ProductBenefits({ benefits }) {
  return (
    <ul className="product-benefits" aria-label="SoundSpot benefits">
      {benefits.map((benefit, index) => (
        <li key={benefit.title}>
          <span className="product-benefits__icon" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span>
            <strong>{benefit.title}</strong>
            <small>{benefit.text}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function TrendingCities({ onCitySelect }) {
  const highestCount = Math.max(...mockTrendingCities.map((city) => city.count))

  return (
    <section
      className="landing-section landing-section--highlight"
      aria-labelledby="trending-cities-title"
    >
      <div className="landing-section__heading landing-section__heading--split">
        <div>
          <p className="section-kicker">City discovery</p>
          <h2 id="trending-cities-title">Trending cities</h2>
        </div>
        <button
          className="landing-section__view-all"
          type="button"
          disabled
          title="Expanded city discovery is coming later"
        >
          View all
        </button>
      </div>
      <div className="trending-cities">
        {mockTrendingCities.map((city, index) => (
          <button
            key={city.name}
            className={`trending-city trending-city--${city.tone}`}
            type="button"
            onClick={() => onCitySelect(city.name)}
          >
            <strong className="trending-city__rank">{index + 1}</strong>
            <span
              className="trending-city__visual"
              aria-hidden="true"
            />
            <span className="trending-city__content">
              <span>
                <strong>{city.name}</strong>
                <small>{city.country}</small>
              </span>
              <span className="trending-city__count">
                {city.count.toLocaleString('en-US')} events
              </span>
              <span className="trending-city__progress" aria-hidden="true">
                <i style={{ width: `${(city.count / highestCount) * 100}%` }} />
              </span>
            </span>
          </button>
        ))}
      </div>
      <p className="landing-vision-note">Preview data for product direction.</p>
    </section>
  )
}

function FeaturedEventCard({ event, index }) {
  const {
    isAuthenticated,
    openAuthModal,
    refreshCurrentUser,
  } = useAuth()
  const {
    addFavorite,
    removeFavorite,
    isFavorite,
    isFavoritePending,
  } = useFavorites()
  const [favoriteError, setFavoriteError] = useState('')
  const image = getEventImage(event)
  const ticketUrl = (event.ticket_url || '').trim()
  const favorite = isFavorite(event)
  const favoritePending = isFavoritePending(event)
  const title = event.name || 'Untitled event'

  async function handleFavoriteClick() {
    setFavoriteError('')

    if (!isAuthenticated) {
      openAuthModal('register', 'Create an account to save events.')
      return
    }

    try {
      if (favorite) await removeFavorite(event)
      else await addFavorite(event)
    } catch (error) {
      if (error?.status === 401) {
        try {
          const currentUser = await refreshCurrentUser()
          if (!currentUser) {
            openAuthModal('login', 'Your session expired. Sign in to save events.')
          } else {
            setFavoriteError('Favorite update failed. Please try again.')
          }
        } catch {
          setFavoriteError('Favorite update failed. Please try again.')
        }
        return
      }
      setFavoriteError('Favorite update failed. Please try again.')
    }
  }

  return (
    <article
      className={`featured-event featured-event--${
        event.tone || ['violet', 'cyan', 'magenta', 'blue'][index % 4]
      }`}
    >
      <div
        className={`featured-event__visual ${image ? 'has-image' : ''}`.trim()}
        style={image ? { backgroundImage: `url("${image}")` } : undefined}
      >
        <span>{formatFeaturedDate(event.date)}</span>
        <button
          className={[
            'featured-event__favorite',
            favorite ? 'is-favorite' : '',
            favoritePending ? 'is-loading' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          type="button"
          onClick={handleFavoriteClick}
          disabled={favoritePending}
          aria-pressed={favorite}
          aria-label={
            favorite
              ? `Remove ${title} from favorites`
              : `Add ${title} to favorites`
          }
          title={favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {favorite ? '\u2665' : '\u2661'}
        </button>
      </div>
      <div className="featured-event__body">
        <h3>{title}</h3>
        <p>
          {(event.venue || '').trim() || 'Venue TBA'}
          <span aria-hidden="true"> / </span>
          {(event.city || '').trim() || 'City TBA'}
        </p>
        {event.time ? (
          <p className="featured-event__time">{event.time}</p>
        ) : null}
        {favoriteError ? (
          <p className="featured-event__favorite-error" role="alert">
            {favoriteError}
          </p>
        ) : null}
        <ProviderBadge
          source={event.source}
          href={ticketUrl}
          compact
          unavailable={!ticketUrl}
        />
      </div>
    </article>
  )
}

export function FeaturedEvents({ events, loading }) {
  const realEvents = events.slice(0, 3)
  const displayEvents =
    realEvents.length > 0
      ? realEvents
      : mockFeaturedEvents
          .slice(0, 3)
          .map((event) => ({ ...event, isVisionPreview: true }))

  return (
    <section
      className="landing-section landing-section--highlight"
      aria-labelledby="featured-events-title"
    >
      <div className="landing-section__heading landing-section__heading--split">
        <div>
          <p className="section-kicker">From the discovery map</p>
          <h2 id="featured-events-title">Featured events</h2>
        </div>
        <button
          className="landing-section__view-all"
          type="button"
          disabled
          title="Expanded featured events are coming later"
        >
          View all
        </button>
      </div>
      <div className="featured-events">
        {loading
          ? Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="featured-event featured-event--loading"
                aria-hidden="true"
              />
            ))
          : displayEvents.map((event, index) =>
              event.isVisionPreview ? (
                <article
                  className={`featured-event featured-event--${
                    event.tone || ['violet', 'cyan', 'magenta', 'blue'][index % 4]
                  }`}
                  key={
                    event.id ||
                    `${event.name || 'event'}-${event.date || ''}-${index}`
                  }
                >
                  <div className="featured-event__visual">
                    <span>{formatFeaturedDate(event.date)}</span>
                  </div>
                  <div className="featured-event__body">
                    <h3>{event.name || 'Untitled event'}</h3>
                    <p>
                      {(event.venue || '').trim() || 'Venue TBA'}
                      <span aria-hidden="true"> / </span>
                      {(event.city || '').trim() || 'City TBA'}
                    </p>
                    {event.time ? (
                      <p className="featured-event__time">{event.time}</p>
                    ) : null}
                    <span className="vision-preview-badge">Vision preview</span>
                  </div>
                </article>
              ) : (
                <FeaturedEventCard
                  event={event}
                  index={index}
                  key={
                    event.id ||
                    `${event.name || 'event'}-${event.date || ''}-${index}`
                  }
                />
              )
            )}
      </div>
      {realEvents.length === 0 && !loading ? (
        <p className="landing-vision-note">
          Preview events shown while discovery data is unavailable.
        </p>
      ) : null}
    </section>
  )
}

export function HowItWorks() {
  return (
    <section
      className="landing-section"
      id="how-it-works"
      aria-labelledby="how-it-works-title"
    >
      <div className="landing-section__heading">
        <p className="section-kicker">Three simple steps</p>
        <h2 id="how-it-works-title">How SoundSpot works</h2>
      </div>
      <div className="product-steps">
        {howItWorksSteps.map((step, index) => (
          <article className="product-step" key={step.title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <i aria-hidden="true" />
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </article>
        ))}
      </div>
      <p className="landing-vision-note">
        Personalization and notifications are product roadmap previews.
      </p>
    </section>
  )
}

export function SourcesStrip() {
  const sources = [
    {
      name: 'Ticketmaster',
      icon: '/providers/ticketmaster.png',
      text: 'Major concerts, tours and arena listings.',
    },
    {
      name: 'Shotgun',
      icon: '/providers/shotgun.png',
      text: 'Club nights, electronic music and independent scenes.',
    },
    {
      name: 'OpenAgenda',
      icon: '/providers/openagenda.png',
      text: 'Local concerts, festivals and cultural music events.',
    },
  ]

  return (
    <section
      className="landing-section sources-showcase"
      id="sources"
      aria-labelledby="sources-showcase-title"
    >
      <div className="landing-section__heading">
        <p className="section-kicker">Integrated and planned providers</p>
        <h2 id="sources-showcase-title">Trusted data from leading sources</h2>
        <p>
          We aggregate and normalize event data from multiple trusted sources
          to bring you a clearer view of live music worldwide.
        </p>
      </div>
      <div className="sources-strip">
        {sources.map((source) => (
          <article className="source-tile" key={source.name}>
            <img src={source.icon} alt="" aria-hidden="true" />
            <div>
              <h3>{source.name}</h3>
              <p>{source.text}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="future-sources" aria-label="Sources being explored">
        <span>Planned / explored</span>
        {mockFutureSources.map((source) => (
          <span key={source}>{source}</span>
        ))}
        <span>+ More</span>
      </div>
      <p className="sources-showcase__note">
        Future sources are visual roadmap placeholders and are not connected to
        event results.
      </p>
    </section>
  )
}

export function AboutSoundSpot() {
  return (
    <section
      className="landing-section about-showcase"
      id="about"
      aria-labelledby="about-soundspot-title"
    >
      <div>
        <p className="section-kicker">About SoundSpot</p>
        <h2 id="about-soundspot-title">
          Live music discovery without the tab overload
        </h2>
      </div>
      <p>
        SoundSpot brings concerts, clubs, festivals and nightlife listings into
        one map-first experience. Search by city or artist, compare sources and
        continue on the original provider when an event fits your night.
      </p>
    </section>
  )
}

export function FinalCTA() {
  return (
    <section className="final-cta" aria-labelledby="final-cta-title">
      <div>
        <p className="section-kicker">Your next night starts here</p>
        <h2 id="final-cta-title">Make every city your stage</h2>
        <p>
          Create an account to personalize your feed and never miss a show.
        </p>
      </div>
      <div className="final-cta__actions">
        <a className="final-cta__button" href="#explore-map">
          Get started for free
        </a>
        <button type="button" disabled title="Authentication is coming later">
          Sign in to your account
        </button>
      </div>
      <ul className="final-cta__benefits" aria-label="Product vision benefits">
        <li>Free to use</li>
        <li>No credit card required</li>
        <li>Sync across devices</li>
      </ul>
    </section>
  )
}

export function AppFooter() {
  const [newsletterEmail, setNewsletterEmail] = useState('')
  const [newsletterMessage, setNewsletterMessage] = useState('')

  function handleNewsletterSubmit(event) {
    event.preventDefault()
    setNewsletterMessage(
      'Newsletter signup is coming soon. No email was submitted.',
    )
  }

  return (
    <footer className="product-footer">
      <div className="product-footer__brand">
        <img src={logo} alt="SoundSpot" />
        <p>Discover live music events anywhere in the world.</p>
        <span>© 2026 SoundSpot</span>
      </div>
      <div className="product-footer__links">
        <div>
          <h2>Product</h2>
          <a href="#explore">Explore</a>
          <a href="#how-it-works">How it works</a>
          <a href="#sources">Sources</a>
        </div>
        <div>
          <h2>Company</h2>
          <a href="#about">About</a>
          <a
            href="https://github.com/BucKz96/SoundSpot/issues"
            target="_blank"
            rel="noreferrer"
          >
            Contact
          </a>
          <span>Privacy Policy</span>
          <span>Terms of Service</span>
        </div>
        <div>
          <h2>Community</h2>
          <a
            href="https://github.com/BucKz96/SoundSpot"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <span>Twitter / X</span>
          <span>Discord</span>
        </div>
        <form
          className="product-footer__newsletter"
          onSubmit={handleNewsletterSubmit}
        >
          <h2>Stay in the loop</h2>
          <p>Get updates on new product features and events.</p>
          <div>
            <input
              type="email"
              placeholder="Your email address"
              aria-label="Newsletter email"
              value={newsletterEmail}
              onChange={(event) => {
                setNewsletterEmail(event.target.value)
                setNewsletterMessage('')
              }}
            />
            <button type="submit" title="Newsletter is coming later">
              &gt;
            </button>
          </div>
          {newsletterMessage ? (
            <p className="product-footer__newsletter-status" role="status">
              {newsletterMessage}
            </p>
          ) : null}
        </form>
      </div>
    </footer>
  )
}
