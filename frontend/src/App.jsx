import { useEffect, useState } from 'react'
import ResetPasswordView from './components/ResetPasswordView'
import VerifyEmailView from './components/VerifyEmailView'
import { HomePage } from './pages'

function getAuthRoute() {
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
  return { name: 'home', token: '' }
}

function App() {
  const [, setLocationKey] = useState(
    `${window.location.pathname}${window.location.search}`,
  )
  const route = getAuthRoute()

  useEffect(() => {
    function handleLocationChange() {
      setLocationKey(`${window.location.pathname}${window.location.search}`)
    }

    window.addEventListener('popstate', handleLocationChange)
    return () => window.removeEventListener('popstate', handleLocationChange)
  }, [])

  if (route.name === 'verify-email') {
    return <VerifyEmailView token={route.token} />
  }
  if (route.name === 'reset-password') {
    return <ResetPasswordView token={route.token} />
  }

  return <HomePage />
}

export default App
