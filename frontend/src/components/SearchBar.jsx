import { useState } from 'react'

function SearchBar({ onSearch, loading }) {
  const [searchType, setSearchType] = useState('city')
  const [query, setQuery] = useState('')

  const placeholder =
    searchType === 'artist'
      ? 'Search an artist like Coldplay...'
      : 'Search a city like London...'

  function handleSubmit(event) {
    event.preventDefault()
    onSearch({ type: searchType, value: query })
  }

  return (
    <form
      className="search-section search-panel"
      aria-label="Event search"
      onSubmit={handleSubmit}
    >
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
      </div>
      <div className="search-controls">
        <input
          className="search-input"
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="search-button" type="submit" disabled={loading}>
          Search
        </button>
      </div>
    </form>
  )
}

export default SearchBar
