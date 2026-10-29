import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, onUnauthorized } from '../api.js'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null })

  useEffect(() => {
    let alive = true
    api
      .me()
      .then(({ user }) => {
        if (alive) setState({ status: 'authenticated', user })
      })
      .catch(() => {
        if (alive) setState({ status: 'anonymous', user: null })
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(
    () =>
      onUnauthorized(() => {
        setState({ status: 'anonymous', user: null })
      }),
    [],
  )

  const login = useCallback(async (credentials) => {
    const { user } = await api.login(credentials)
    setState({ status: 'authenticated', user })
    return user
  }, [])

  const register = useCallback((payload) => api.register(payload), [])

  const verifyOtp = useCallback(async (payload) => {
    const { user } = await api.verifyOtp(payload)
    setState({ status: 'authenticated', user })
    return user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setState({ status: 'anonymous', user: null })
    }
  }, [])

  const value = useMemo(
    () => ({
      ...state,
      isAuthenticated: state.status === 'authenticated',
      login,
      register,
      verifyOtp,
      logout,
    }),
    [state, login, register, verifyOtp, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
