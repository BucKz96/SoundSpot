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
  { value: 'tonight', label: 'Tonight' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'concerts', label: 'Concerts' },
  { value: 'clubs', label: 'Clubs' },
  { value: 'festivals', label: 'Festivals' },
  { value: 'electronic', label: 'Electronic' },
]

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
  searchLabel,
  eventsCount,
  loading,
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
  const eventsLabel = eventsCount === 1 ? 'event' : 'events'
  const countLabel = loading
    ? 'Searching events...'
    : `${eventsCount} ${eventsLabel} found`

  return (
    <section className="event-filters" aria-label="Filter events">
      <div className="event-filters__summary" aria-live="polite">
        <h2 className="event-filters__title">{searchLabel || 'Global search'}</h2>
        <p className="event-filters__count">{countLabel}</p>
      </div>

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
