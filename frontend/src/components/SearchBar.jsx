import { useState } from 'react'
import soundSpotIcon from '../assets/soundspot-icon-transparent.png'

function SearchBar({ onSearch, loading }) {
  const [searchType, setSearchType] = useState('city')
  const [query, setQuery] = useState('')

  const placeholder =
    searchType === 'artist'
      ? 'Search an artist like Coldplay...'
      : searchType === 'venue'
        ? 'Venue search is coming soon...'
      : 'Search a city like London...'

  function handleSubmit(event) {
    event.preventDefault()
    if (searchType === 'venue') return
    onSearch({ type: searchType, value: query })
  }

  return (
    <form
      className="search-section search-panel"
      aria-label="Event search"
      onSubmit={handleSubmit}
    >
      <div className="search-controls">
        <div className="search-type-toggle" aria-label="Search type">
          <button
            className={`search-type-button ${searchType === 'city' ? 'is-active' : ''}`}
            type="button"
            aria-pressed={searchType === 'city'}
            onClick={() => setSearchType('city')}
          >
            City
          </button>
          <button
            className={`search-type-button ${searchType === 'artist' ? 'is-active' : ''}`}
            type="button"
            aria-pressed={searchType === 'artist'}
            onClick={() => setSearchType('artist')}
          >
            Artist
          </button>
          <button
            className={`search-type-button ${searchType === 'venue' ? 'is-active' : ''}`}
            type="button"
            aria-pressed={searchType === 'venue'}
            onClick={() => setSearchType('venue')}
          >
            Venue
          </button>
        </div>
        <input
          className="search-input"
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={searchType === 'venue'}
        />
        <button
          className="search-button"
          type="submit"
          disabled={loading || searchType === 'venue'}
        >
          <img
            className="search-button__icon"
            src={soundSpotIcon}
            alt=""
            aria-hidden="true"
          />
          <span>Search events</span>
        </button>
      </div>
      {searchType === 'venue' ? (
        <p className="search-panel__notice" role="status">
          Venue search is a product preview and is not connected yet.
        </p>
      ) : null}
    </form>
  )
}

export default SearchBar
