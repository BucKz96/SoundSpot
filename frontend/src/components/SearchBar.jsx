function SearchBar({ cityPlaceholder }) {
  return (
    <section className="search-section" aria-label="Recherche de ville">
      <input
        className="search-input"
        type="text"
        placeholder={cityPlaceholder}
        aria-label="Ville"
      />
      <button className="search-button" type="button">
        Rechercher
      </button>
    </section>
  )
}

export default SearchBar
