export const LOCAL_DEV_AUTH_COOKIE = 'growthos-local-session'
export const LOCAL_DEV_EMAIL = 'local@growthos.dev'
export const LOCAL_DEV_PASSWORD = 'GrowthOS-local-2026!'
export const LOCAL_DEV_PROJECT_ID = 'local-growthos-project'

export function isLocalDevAuthEnabled() {
  return process.env.NODE_ENV !== 'production'
}

export function isLocalDevCredentials(email: string, password: string) {
  return (
    isLocalDevAuthEnabled() &&
    email.trim().toLowerCase() === LOCAL_DEV_EMAIL &&
    password === LOCAL_DEV_PASSWORD
  )
}

export function hasLocalDevSessionCookie(cookieHeader: string | null | undefined) {
  if (!isLocalDevAuthEnabled() || !cookieHeader) return false
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .some((part) => part === `${LOCAL_DEV_AUTH_COOKIE}=1`)
}
