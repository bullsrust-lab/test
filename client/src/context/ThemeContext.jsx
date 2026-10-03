import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { getItem, setItem } from '../utils/storage'

const ThemeContext = createContext(null)

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

const savedTheme = () => {
  const saved = getItem('theme')
  return saved === 'light' || saved === 'dark' ? saved : null
}

export function ThemeProvider({ children }) {
  // null = follow the system setting, CSS handles that with a media query
  const [saved, setSaved] = useState(savedTheme)
  const [system, setSystem] = useState(() => (darkQuery().matches ? 'dark' : 'light'))

  useEffect(() => {
    const query = darkQuery()
    const onChange = (e) => setSystem(e.matches ? 'dark' : 'light')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useLayoutEffect(() => {
    if (saved) document.documentElement.dataset.theme = saved
    else delete document.documentElement.dataset.theme
  }, [saved])

  const theme = saved || system

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setItem('theme', next)
    setSaved(next)
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
