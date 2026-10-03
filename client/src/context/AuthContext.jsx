import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { clearAuth, getItem, getStoredUser, saveAuth } from '../utils/storage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getItem('token'))
  const [user, setUser] = useState(getStoredUser)

  const login = useCallback((data) => {
    saveAuth(data)
    setToken(data.token)
    setUser(data.user)
  }, [])

  const logout = useCallback(() => {
    clearAuth()
    setToken(null)
    setUser(null)
  }, [])

  // logging in or out in another tab changes the token under our feet, reload to pick it up
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'token' || e.key === null) window.location.reload()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const value = useMemo(
    () => ({ token, user, isDemo: user?.role === 'demo', login, logout }),
    [token, user, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
