import { Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import Spinner from '../components/Spinner'
import ThemeToggle from '../components/ThemeToggle'
import OrgSwitcher from '../components/OrgSwitcher'
import { IconChart, IconClose, IconList, IconLogout, IconMenu, IconPlus, IconUser, IconUsers } from '../components/Icons'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import { setSessionFlag } from '../utils/storage'
import styles from './DashboardLayout.module.css'

const links = [
  { to: 'all-jobs', label: 'All jobs', icon: IconList },
  { to: 'add-job', label: 'Add job', icon: IconPlus },
  { to: 'stats', label: 'Stats', icon: IconChart },
  { to: 'team', label: 'Team', icon: IconUsers },
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
  const { pathname } = useLocation()
  const [lastPath, setLastPath] = useState(pathname)
  const { user, isDemo, logout } = useAuth()
  const { active, canWrite, loading: orgsLoading, error: orgsError, reloadOrgs } = useOrg()
  const navigate = useNavigate()
  const menuBtnRef = useRef(null)
  const closeBtnRef = useRef(null)
  const mainRef = useRef(null)
  const firstRender = useRef(true)

  // any navigation closes the mobile menu (links, logo, back button)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setMenuOpen(false)
  }

  const closeMenu = () => {
    setMenuOpen(false)
    menuBtnRef.current?.focus()
  }

  useEffect(() => {
    if (!menuOpen) return
    closeBtnRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        menuBtnRef.current?.focus()
      }
    }
    // the drawer only exists on small screens, don't leave the page inert after resizing
    const wide = window.matchMedia('(min-width: 961px)')
    const onResize = (e) => e.matches && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    wide.addEventListener('change', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      wide.removeEventListener('change', onResize)
    }
  }, [menuOpen])

  // after moving to another page, start keyboard / screen reader users at the new content
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (!mainRef.current?.contains(document.activeElement)) mainRef.current?.focus({ preventScroll: true })
  }, [pathname])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  // a flag rather than router state: logging out also triggers the protected route's own
  // redirect to /register, and whichever navigation lands last would drop the state
  const signUp = () => {
    setSessionFlag('wantsSignup')
    logout()
    navigate('/register')
  }

  return (
    <div className={styles.layout}>
      <aside className={`${styles.sidebar} ${menuOpen ? styles.open : ''}`} id="sidebar">
        <div className={styles.sidebarTop}>
          <Logo to="/dashboard" />
          <button
            ref={closeBtnRef}
            type="button"
            className={`${styles.iconBtn} ${styles.closeBtn}`}
            onClick={closeMenu}
            aria-label="Close menu"
          >
            <IconClose />
          </button>
        </div>

        <OrgSwitcher />

        <nav className={styles.nav} aria-label="Dashboard">
          {links
            // viewers can't add jobs, so don't offer it
            .filter((link) => link.to !== 'add-job' || canWrite)
            .map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>
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

      {menuOpen && <div className={styles.overlay} onClick={closeMenu} aria-hidden="true" />}

      <div className={styles.main} inert={menuOpen || undefined}>
        <header className={styles.topbar}>
          <button
            ref={menuBtnRef}
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
            <button type="button" onClick={signUp}>
              Create your own account
            </button>{' '}
            to track real applications.
          </p>
        )}

        <main className={styles.content} ref={mainRef} tabIndex={-1}>
          <Suspense fallback={<Spinner />}>
            {orgsError && !active ? (
              <div className={styles.orgError} role="alert">
                <span>{orgsError}. Your jobs are safe, the page just couldn't load which workspaces you're in.</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={reloadOrgs}>
                  Try again
                </button>
              </div>
            ) : orgsLoading && !active ? (
              <Spinner />
            ) : (
              <Outlet key={active?._id ?? 'none'} />
            )}
          </Suspense>
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout
