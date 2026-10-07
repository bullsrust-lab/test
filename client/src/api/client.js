import axios from 'axios'
import { clearAuth, forgetOrgId, getItem, setSessionFlag } from '../utils/storage'

const api = axios.create({ baseURL: '/api/v1' })

// The workspace this tab works in, set by OrgProvider from what the UI shows. It's kept in memory
// rather than read from localStorage on every request: localStorage is shared by all tabs, and a
// switch in one tab must not quietly send another tab's writes to a different organization.
let activeOrgId = null
export const setActiveOrgId = (id) => {
  activeOrgId = id
}

api.interceptors.request.use((config) => {
  const token = getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  // without it the server uses the Personal workspace
  if (activeOrgId && !config.headers['X-Org-Id']) config.headers['X-Org-Id'] = activeOrgId
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // a 401 from /auth/login just means wrong password, not an expired session
    const isAuthRoute = error.config?.url?.startsWith('/auth')
    if (error.response?.status === 401 && !isAuthRoute) {
      clearAuth()
      if (window.location.pathname.startsWith('/invite/')) {
        // stay on the invitation: it can still be accepted after logging in again
        window.dispatchEvent(new Event('auth:expired'))
      } else {
        setSessionFlag('sessionExpired')
        window.location.assign('/register')
      }
    }
    // removed from the team in the meantime: fall back to the Personal workspace
    if (error.response?.data?.code === 'NOT_A_MEMBER' && error.config?.headers?.['X-Org-Id']) {
      forgetOrgId()
      window.location.reload()
    }
    return Promise.reject(error)
  }
)

export const getErrorMessage = (error) =>
  error.response?.data?.msg || (error.request ? 'Server is not responding, try again' : error.message)

export const getFieldErrors = (error) =>
  Object.fromEntries((error.response?.data?.errors || []).map((e) => [e.field, e.msg]))

export default api
