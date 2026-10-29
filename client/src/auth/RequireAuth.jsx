import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { SplashScreen } from '../components/Loading.jsx'

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <SplashScreen />

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }

  return <Outlet />
}

export function PublicOnly() {
  const { status } = useAuth()

  if (status === 'loading') return <SplashScreen />
  if (status === 'authenticated') return <Navigate to="/" replace />

  return <Outlet />
}
