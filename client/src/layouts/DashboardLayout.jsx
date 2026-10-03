import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import Spinner from '../components/Spinner'
import ThemeToggle from '../components/ThemeToggle'
import { IconChart, IconClose, IconList, IconLogout, IconMenu, IconPlus, IconUser } from '../components/Icons'
import { useAuth } from '../context/AuthContext'
import styles from './DashboardLayout.module.css'

const links = [
  { to: 'all-jobs', label: 'All jobs', icon: IconList },
  { to: 'add-job', label: 'Add job', icon: IconPlus },
  { to: 'stats', label: 'Stats', icon: IconChart },
  { to: 'profile', label: 'Profile', icon: IconUser },
]

const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

function DashboardLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, isDemo, logout } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className={styles.layout}>
      <aside className={`${styles.sidebar} ${menuOpen ? styles.open : ''}`} id="sidebar">
        <div className={styles.sidebarTop}>
          <Logo to="/dashboard" />
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.closeBtn}`}
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <IconClose />
          </button>
        </div>

        <nav className={styles.nav} aria-label="Dashboard">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>

        <button type="button" className={`${styles.link} ${styles.logout}`} onClick={handleLogout}>
          <IconLogout />
          Log out
        </button>
      </aside>

      {menuOpen && <div className={styles.overlay} onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.menuBtn}`}
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="sidebar"
          >
            <IconMenu />
          </button>

          <div className={styles.topbarRight}>
            <ThemeToggle className={styles.iconBtn} />
            <NavLink to="profile" className={styles.user} aria-label={`Profile: ${user?.name}`}>
              <span className={styles.avatar} aria-hidden="true">
                {initials(user?.name)}
              </span>
              <span className={styles.userName}>{user?.name}</span>
            </NavLink>
          </div>
        </header>

        {isDemo && (
          <p className={styles.demoBanner}>
            You're looking at a demo account, so editing is turned off.{' '}
            <button type="button" onClick={() => { logout(); navigate('/register') }}>
              Create your own account
            </button>{' '}
            to track real applications.
          </p>
        )}

        <main className={styles.content}>
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout
