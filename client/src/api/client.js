import axios from 'axios'
import { clearAuth, getItem } from '../utils/storage'

const api = axios.create({ baseURL: '/api/v1' })

api.interceptors.request.use((config) => {
  const token = getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // a 401 from /auth/login just means wrong password, not an expired session
    const isAuthRoute = error.config?.url?.startsWith('/auth')
    if (error.response?.status === 401 && !isAuthRoute) {
      clearAuth()
      sessionStorage.setItem('sessionExpired', '1')
      window.location.assign('/register')
    }
    return Promise.reject(error)
  }
)

export const getErrorMessage = (error) =>
  error.response?.data?.msg || (error.request ? 'Server is not responding, try again' : error.message)

export const getFieldErrors = (error) =>
  Object.fromEntries((error.response?.data?.errors || []).map((e) => [e.field, e.msg]))

export default api
