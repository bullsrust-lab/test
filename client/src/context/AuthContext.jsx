import { createContext, useCallback, useContext, useMemo, useState } from 'react'
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

  const value = useMemo(
    () => ({ token, user, isDemo: user?.role === 'demo', login, logout }),
    [token, user, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
