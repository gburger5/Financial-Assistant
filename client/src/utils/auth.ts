export const getToken = (): string | null =>
  localStorage.getItem('token') || sessionStorage.getItem('token')

export const clearToken = (): void => {
  localStorage.removeItem('token')
  sessionStorage.removeItem('token')
}