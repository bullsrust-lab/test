import { useTheme } from '../context/ThemeContext'
import { IconMoon, IconSun } from './Icons'

function ThemeToggle({ className }) {
  const { theme, toggleTheme } = useTheme()
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <button type="button" className={className} onClick={toggleTheme} aria-label={label} title={label}>
      {theme === 'dark' ? <IconSun /> : <IconMoon />}
    </button>
  )
}

export default ThemeToggle
