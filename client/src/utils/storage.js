// localStorage can throw in private mode / blocked storage, so every access is wrapped

export const getItem = (key) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export const setItem = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export const removeItem = (key) => {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export const getStoredUser = () => {
  try {
    return JSON.parse(getItem('user'))
  } catch {
    return null
  }
}

export const saveAuth = ({ user, token }) => {
  setItem('token', token)
  setItem('user', JSON.stringify(user))
}

export const clearAuth = () => {
  removeItem('token')
  removeItem('user')
}
