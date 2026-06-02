import logo from '../assets/soundspot-logo.png'

function AppNavbar() {
  return (
    <header className="app-navbar">
      <div className="app-navbar__inner">
        <a className="app-navbar__brand" href="#explore" aria-label="SoundSpot home">
          <img className="app-navbar__logo" src={logo} alt="SoundSpot" />
          <span className="app-navbar__tagline">Explore live music around the world</span>
        </a>

        <nav className="app-navbar__nav" aria-label="Primary navigation">
          <a href="#explore">Explore</a>
          <a href="#how-it-works">How it works</a>
          <a href="#sources">Sources</a>
          <a href="#about">About</a>
          <a
            href="https://github.com/BucKz96/SoundSpot"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  )
}

export default AppNavbar
