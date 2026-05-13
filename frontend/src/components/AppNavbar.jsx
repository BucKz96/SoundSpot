function AppNavbar() {
  return (
    <header className="app-navbar">
      <div className="app-navbar__inner">
        <div className="app-navbar__brand" aria-label="SoundSpot">
          <span className="app-navbar__logo" aria-hidden="true">
            <svg
              className="app-navbar__logo-svg"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 32 32"
              fill="none"
            >
              <path
                fill="currentColor"
                fillOpacity="0.2"
                d="M6 4h20a2 2 0 012 2v20a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2z"
              />
              <path
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                d="M10 22V10l4 2 4-4v12"
              />
              <circle cx="22" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </span>
          <span className="app-navbar__name">SoundSpot</span>
        </div>
        <p className="app-navbar__tagline">Explore live music around the world</p>
      </div>
    </header>
  )
}

export default AppNavbar
