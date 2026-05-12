import { useState } from 'react'

function SearchBar({ onSearch, loading }) {
  const [city, setCity] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    onSearch(city)
  }

  return (
    <form
      className="search-section"
      aria-label="Recherche de ville"
      onSubmit={handleSubmit}
    >
      <input
        className="search-input"
        type="text"
        placeholder="Rechercher une ville"
        value={city}
        onChange={(event) => setCity(event.target.value)}
      />
      <button className="search-button" type="submit" disabled={loading}>
        Rechercher
      </button>
    </form>
  )
}

export default SearchBar
