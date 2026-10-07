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

// one-off flags between pages (e.g. "session expired"), same try/catch reasoning
export const getSessionFlag = (key) => {
  try {
    return sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export const clearSessionFlag = (key) => {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export const setSessionFlag = (key) => {
  try {
    sessionStorage.setItem(key, '1')
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

// the chosen workspace lives in this tab's sessionStorage and, as the default for new tabs, in localStorage
export const forgetOrgId = () => {
  removeItem('orgId')
  try {
    sessionStorage.removeItem('orgId')
  } catch {
    /* ignore */
  }
}

export const clearAuth = () => {
  removeItem('token')
  removeItem('user')
  forgetOrgId()
}
