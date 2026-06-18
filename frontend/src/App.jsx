import { useEffect, useState } from 'react'
import ResetPasswordView from './components/ResetPasswordView'
import VerifyEmailView from './components/VerifyEmailView'
import {
  AboutPage,
  ContactPage,
  HomePage,
  LegalPage,
  PrivacyPage,
} from './pages'

const PUBLIC_PAGE_TITLES = {
  about: 'About | SoundSpot',
  contact: 'Contact | SoundSpot',
  legal: 'Legal | SoundSpot',
  privacy: 'Privacy Policy | SoundSpot',
}

function getRoute() {
  const { pathname, search } = window.location
  const params = new URLSearchParams(search)
  const view = params.get('view')
  const token = params.get('token') || ''

  if (pathname === '/verify-email' || view === 'verify-email') {
    return { name: 'verify-email', token }
  }
  if (pathname === '/reset-password' || view === 'reset-password') {
    return { name: 'reset-password', token }
  }
  if (pathname === '/about') {
    return { name: 'about', token: '' }
  }
  if (pathname === '/contact') {
    return { name: 'contact', token: '' }
  }
  if (pathname === '/privacy') {
    return { name: 'privacy', token: '' }
  }
  if (pathname === '/legal' || pathname === '/terms') {
    return { name: 'legal', token: '' }
  }
  return { name: 'home', token: '' }
}

function App() {
  const [, setLocationKey] = useState(
    `${window.location.pathname}${window.location.search}`,
  )
  const route = getRoute()

  useEffect(() => {
    function handleLocationChange() {
      setLocationKey(`${window.location.pathname}${window.location.search}`)
    }

    window.addEventListener('popstate', handleLocationChange)
    return () => window.removeEventListener('popstate', handleLocationChange)
  }, [])

  useEffect(() => {
    document.title = PUBLIC_PAGE_TITLES[route.name] || 'SoundSpot'
  }, [route.name])

  if (route.name === 'verify-email') {
    return <VerifyEmailView token={route.token} />
  }
  if (route.name === 'reset-password') {
    return <ResetPasswordView token={route.token} />
  }
  if (route.name === 'about') {
    return <AboutPage />
  }
  if (route.name === 'contact') {
    return <ContactPage />
  }
  if (route.name === 'privacy') {
    return <PrivacyPage />
  }
  if (route.name === 'legal') {
    return <LegalPage />
  }

  return <HomePage />
}

export default App
