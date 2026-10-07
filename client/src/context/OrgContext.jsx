import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { setActiveOrgId } from '../api/client'
import { useAuth } from './AuthContext'
import { getItem, removeItem, setItem } from '../utils/storage'

const OrgContext = createContext(null)

// Each tab remembers its own workspace (sessionStorage); localStorage only holds the last choice,
// so a new tab opens where you were working.
const storedOrgId = () => {
  try {
    const own = sessionStorage.getItem('orgId')
    if (own) return own
  } catch {
    /* storage blocked */
  }
  return getItem('orgId')
}

const rememberOrgId = (id) => {
  try {
    if (id) sessionStorage.setItem('orgId', id)
    else sessionStorage.removeItem('orgId')
  } catch {
    /* storage blocked */
  }
  if (id) setItem('orgId', id)
  else removeItem('orgId')
}

// The organizations the user belongs to and the one this tab is working in.
export function OrgProvider({ children }) {
  const { token, isDemo } = useAuth()
  const [orgs, setOrgs] = useState([])
  const [activeId, setActiveId] = useState(storedOrgId)
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [seenToken, setSeenToken] = useState(token)

  // a different session (log out, log in as someone else): start from the stored choice again
  if (token !== seenToken) {
    setSeenToken(token)
    setActiveId(storedOrgId())
    setOrgs([])
    setLoading(Boolean(token))
  }

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    api
      .get('/orgs', { signal: controller.signal })
      .then(({ data }) => setOrgs(data.organizations))
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.response?.data?.msg || "Couldn't load your workspaces")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [token, version])

  const personal = orgs.find((o) => o.personal)
  const chosen = orgs.find((o) => o._id === activeId)
  // while the list is (re)loading, an id we don't know yet is "pending", not "fall back to Personal"
  const active = chosen ?? (loading && activeId ? null : (personal ?? null))

  // set during render, not in an effect: child effects (the pages' first requests) run before
  // a parent's effects, and they must already go to the right organization
  setActiveOrgId(active && !active.personal ? active._id : null)

  // pin this tab to what it shows, so a reload stays here even if another tab switches meanwhile
  useEffect(() => {
    if (!active) return
    try {
      if (!sessionStorage.getItem('orgId')) sessionStorage.setItem('orgId', active._id)
    } catch {
      /* storage blocked */
    }
  }, [active])

  const switchOrg = useCallback((id) => {
    rememberOrgId(id)
    setActiveId(id)
  }, [])

  const reloadOrgs = useCallback(() => setVersion((v) => v + 1), [])

  const value = useMemo(
    () => ({
      orgs,
      active,
      loading,
      error,
      role: active?.role,
      // the demo account is read-only whatever its role says
      canWrite: !isDemo && (active?.role === 'owner' || active?.role === 'recruiter'),
      isOwner: active?.role === 'owner',
      switchOrg,
      reloadOrgs,
    }),
    [orgs, active, loading, error, isDemo, switchOrg, reloadOrgs]
  )

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export const useOrg = () => useContext(OrgContext)
