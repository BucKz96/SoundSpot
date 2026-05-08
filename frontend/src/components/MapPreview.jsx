function MapPreview({ cityName }) {
  return (
    <section className="map-preview" aria-label="Aperçu de la carte">
      <h2>Carte interactive (aperçu)</h2>
      <div className="map-box">
        <p>Zone carte simulée</p>
        <p>Ville sélectionnée : {cityName}</p>
      </div>
    </section>
  )
}

export default MapPreview
