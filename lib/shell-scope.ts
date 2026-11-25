/** Company pages. The job and change-order switchers stay off these routes and their sub-routes. */
const COMPANY_PREFIXES = ['/reports', '/employees', '/team', '/settings']

export function showsJobSelectors(pathname: string): boolean {
  const path = pathname.split('?')[0] || '/'
  return !COMPANY_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}
