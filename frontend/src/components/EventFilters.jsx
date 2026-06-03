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

function EventFilters({
  selectedGenre,
  dateFrom,
  dateTo,
  onGenreChange,
  onDateFromChange,
  onDateToChange,
  onReset,
}) {
  const hasActiveFilters = selectedGenre !== 'all' || dateFrom || dateTo

  return (
    <section className="event-filters" aria-label="Filter events">
      <div className="event-filters__header">
        <div>
          <p className="event-filters__eyebrow">Filters</p>
          <h2 className="event-filters__title">Refine results</h2>
        </div>
        <button
          className="event-filters__reset"
          type="button"
          onClick={onReset}
          disabled={!hasActiveFilters}
        >
          Reset filters
        </button>
      </div>

      <div className="event-filters__controls">
        <label className="event-filters__field">
          <span>Genre / Style</span>
          <select
            value={selectedGenre}
            onChange={(event) => onGenreChange(event.target.value)}
          >
            {GENRE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="event-filters__field">
          <span>Date from</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => onDateFromChange(event.target.value)}
          />
        </label>

        <label className="event-filters__field">
          <span>Date to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => onDateToChange(event.target.value)}
          />
        </label>
      </div>
    </section>
  )
}

export default EventFilters
