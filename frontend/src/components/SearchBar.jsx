function SearchBar() {
  return (
    <section className="search-section" aria-label="Recherche de ville">
      <input
        className="search-input"
        type="text"
        placeholder="Rechercher une ville (bientot)"
        disabled
      />
      <button className="search-button" type="button" disabled>
        Rechercher
      </button>
    </section>
  )
}

export default SearchBar
