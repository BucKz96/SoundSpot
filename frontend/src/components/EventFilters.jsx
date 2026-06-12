import { useEffect, useRef, useState } from 'react'

const GENRE_OPTIONS = [
  { value: 'all', label: 'All styles' },
  { value: 'electronic', label: 'Electronic' },
  { value: 'techno', label: 'Techno' },
  { value: 'house', label: 'House' },
  { value: 'rap', label: 'Rap' },
  { value: 'rock', label: 'Rock' },
  { value: 'pop', label: 'Pop' },
  { value: 'club', label: 'Club' },
  { value: 'festival', label: 'Festival' },
  { value: 'jazz', label: 'Jazz' },
  { value: 'classical', label: 'Classical' },
  { value: 'metal', label: 'Metal' },
  { value: 'latin', label: 'Latin' },
  { value: 'funk', label: 'Funk' },
  { value: 'other', label: 'Other' },
]

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All sources' },
  { value: 'shotgun', label: 'Shotgun' },
  { value: 'ticketmaster', label: 'Ticketmaster' },
  { value: 'openagenda', label: 'OpenAgenda' },
]

const QUICK_FILTERS = [
  { value: 'tonight', label: 'Tonight', icon: 'moon' },
  { value: 'week', label: 'This week', icon: 'calendar' },
  { value: 'month', label: 'This month', icon: 'calendar-range' },
  { value: 'concerts', label: 'Concerts', icon: 'music' },
  { value: 'clubs', label: 'Clubs', icon: 'disc' },
  { value: 'festivals', label: 'Festivals', icon: 'ticket' },
]

function QuickFilterIcon({ name }) {
  const paths = {
    moon: <path d="M9.8 2.4a4.8 4.8 0 1 0 3.8 7.6A5.4 5.4 0 0 1 9.8 2.4Z" />,
    calendar: (
      <>
        <path d="M3 5.2h10M5.2 2.5v2.2m5.6-2.2v2.2M4.2 3.6h7.6A1.2 1.2 0 0 1 13 4.8v7A1.2 1.2 0 0 1 11.8 13H4.2A1.2 1.2 0 0 1 3 11.8v-7a1.2 1.2 0 0 1 1.2-1.2Z" />
        <path d="M5.3 7.5h2m1.4 0h2M5.3 9.8h2" />
      </>
    ),
    'calendar-range': (
      <>
        <path d="M3 5.2h10M5.2 2.5v2.2m5.6-2.2v2.2M4.2 3.6h7.6A1.2 1.2 0 0 1 13 4.8v7A1.2 1.2 0 0 1 11.8 13H4.2A1.2 1.2 0 0 1 3 11.8v-7a1.2 1.2 0 0 1 1.2-1.2Z" />
        <path d="M5.2 8.3h5.6m-5.6 2.2h3.2" />
      </>
    ),
    music: (
      <>
        <path d="M6.2 11.5V4.3l5.4-1.1v7" />
        <circle cx="4.8" cy="11.5" r="1.4" />
        <circle cx="10.2" cy="10.4" r="1.4" />
      </>
    ),
    disc: (
      <>
        <circle cx="8" cy="8" r="5.2" />
        <circle cx="8" cy="8" r="1.4" />
        <path d="M11.7 4.3 9.1 6.9" />
      </>
    ),
    ticket: (
      <>
        <path d="M3 5.1a1.5 1.5 0 0 0 0 3v2.3h10V8.1a1.5 1.5 0 0 0 0-3V3.6H3v1.5Z" />
        <path d="M8 5.5v3" />
      </>
    ),
  }

  return (
    <svg
      className="event-filters__quick-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function FilterSelect({ value, options, ariaLabel, onChange, className = '' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const selectedOption = options.find((option) => option.value === value) || options[0]

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className={`filter-select ${className} ${open ? 'is-open' : ''}`.trim()}
    >
      <button
        type="button"
        className="filter-select__trigger event-filters__control"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span className="filter-select__value">{selectedOption.label}</span>
        <span className="filter-select__chevron" aria-hidden="true" />
      </button>
      {open ? (
        <ul className="filter-select__menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <li key={option.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`filter-select__option ${
                  option.value === value ? 'is-selected' : ''
                }`.trim()}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function EventFilters({
  selectedGenre,
  selectedSource,
  dateFrom,
  dateTo,
  activeQuickFilter,
  onGenreChange,
  onSourceChange,
  onDateFromChange,
  onDateToChange,
  onQuickFilter,
  onReset,
}) {
  const hasActiveFilters =
    selectedGenre !== 'all' ||
    selectedSource !== 'all' ||
    dateFrom ||
    dateTo ||
    activeQuickFilter
  return (
    <section className="event-filters" aria-label="Filter events">
      <div className="event-filters__quick-list" aria-label="Quick filters">
        {QUICK_FILTERS.map((filter) => {
          const isActive = activeQuickFilter === filter.value

          return (
            <button
              key={filter.value}
              className={`event-filters__quick-filter ${
                isActive ? 'is-active' : ''
              }`.trim()}
              type="button"
              aria-pressed={isActive}
              onClick={() => onQuickFilter(filter.value)}
            >
              <QuickFilterIcon name={filter.icon} />
              {filter.label}
            </button>
          )
        })}
      </div>

      <div className="event-filters__bar">
        <FilterSelect
          className="event-filters__control--style"
          value={selectedGenre}
          options={GENRE_OPTIONS}
          ariaLabel="Genre or style"
          onChange={onGenreChange}
        />

        <FilterSelect
          className="event-filters__control--source"
          value={selectedSource}
          options={SOURCE_OPTIONS}
          ariaLabel="Event source"
          onChange={onSourceChange}
        />

        <label className="event-filters__date-field">
          <span className="visually-hidden">Date from</span>
          <input
            className="event-filters__control event-filters__control--date"
            type="date"
            value={dateFrom}
            aria-label="Date from"
            onChange={(event) => onDateFromChange(event.target.value)}
          />
        </label>

        <label className="event-filters__date-field">
          <span className="visually-hidden">Date to</span>
          <input
            className="event-filters__control event-filters__control--date"
            type="date"
            value={dateTo}
            aria-label="Date to"
            onChange={(event) => onDateToChange(event.target.value)}
          />
        </label>

        <button
          className="event-filters__reset"
          type="button"
          onClick={onReset}
          disabled={!hasActiveFilters}
        >
          Reset
        </button>
      </div>
    </section>
  )
}

export default EventFilters
