import { useState } from 'react'

function SearchBar({ onSearch, loading }) {
  const [city, setCity] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    onSearch(city)
  }

  return (
    <form
      className="search-section search-panel"
      aria-label="City search"
      onSubmit={handleSubmit}
    >
      <input
        className="search-input"
        type="text"
        placeholder="Paris, Lyon, London..."
        value={city}
        onChange={(event) => setCity(event.target.value)}
      />
      <button className="search-button" type="submit" disabled={loading}>
        Search
      </button>
    </form>
  )
}

export default SearchBar
