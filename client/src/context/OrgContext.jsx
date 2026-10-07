import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import { useAuth } from './AuthContext'
import { getItem, removeItem, setItem } from '../utils/storage'

const OrgContext = createContext(null)

// The organizations the user belongs to and the one they're working in. The active id lives in
// localStorage, the axios instance sends it as X-Org-Id with every request.
export function OrgProvider({ children }) {
  const { token, isDemo } = useAuth()
  const [orgs, setOrgs] = useState([])
  const [activeId, setActiveId] = useState(() => getItem('orgId'))
  const [loading, setLoading] = useState(Boolean(token))
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!token) {
      setOrgs([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    api
      .get('/orgs', { signal: controller.signal })
      .then(({ data }) => setOrgs(data.organizations))
      .catch(() => {
        if (!controller.signal.aborted) setOrgs([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [token, version])

  const personal = orgs.find((o) => o.personal)
  // a stored id the user is no longer part of falls back to Personal
  const active = orgs.find((o) => o._id === activeId) ?? personal ?? null

  const switchOrg = useCallback((id) => {
    if (id) setItem('orgId', id)
    else removeItem('orgId')
    setActiveId(id)
  }, [])

  const reloadOrgs = useCallback(() => setVersion((v) => v + 1), [])

  const value = useMemo(
    () => ({
      orgs,
      active,
      loading,
      role: active?.role,
      // the demo account is read-only whatever its role says
      canWrite: !isDemo && (active?.role === 'owner' || active?.role === 'recruiter'),
      isOwner: active?.role === 'owner',
      switchOrg,
      reloadOrgs,
    }),
    [orgs, active, loading, isDemo, switchOrg, reloadOrgs]
  )

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export const useOrg = () => useContext(OrgContext)
