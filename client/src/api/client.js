import axios from 'axios'
import { clearAuth, getItem, removeItem, setSessionFlag } from '../utils/storage'

const api = axios.create({ baseURL: '/api/v1' })

api.interceptors.request.use((config) => {
  const token = getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  // the organization the user is working in; without it the server uses their Personal workspace
  const orgId = getItem('orgId')
  if (orgId && !config.headers['X-Org-Id']) config.headers['X-Org-Id'] = orgId
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // a 401 from /auth/login just means wrong password, not an expired session
    const isAuthRoute = error.config?.url?.startsWith('/auth')
    if (error.response?.status === 401 && !isAuthRoute) {
      clearAuth()
      setSessionFlag('sessionExpired')
      window.location.assign('/register')
    }
    // removed from the team in the meantime: fall back to the Personal workspace
    if (error.response?.data?.code === 'NOT_A_MEMBER' && error.config?.headers?.['X-Org-Id']) {
      removeItem('orgId')
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
