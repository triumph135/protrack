export const MIN_PASSWORD_LENGTH = 8

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,200}$/

/** Only same-app relative paths. Blocks protocol-relative and external redirects. */
export function safeInternalPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value) return fallback

  const trimmed = value.trim()
  if (!trimmed) return fallback

  let decoded = trimmed
  try {
    decoded = decodeURIComponent(trimmed)
  } catch {
    return fallback
  }

  if (!decoded.startsWith('/')) return fallback
  if (decoded.startsWith('//') || decoded.startsWith('/\\')) return fallback
  if (decoded.includes('\\') || decoded.includes('://') || decoded.includes('\0')) return fallback
  if (decoded.includes('//')) return fallback

  return decoded
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isExpired(expiresAt: string | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return true
  const expiry = new Date(expiresAt)
  if (Number.isNaN(expiry.getTime())) return true
  return expiry.getTime() <= now.getTime()
}

export function isValidInvitationToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token)
}

export function isAlreadyRegisteredMessage(message: string | undefined): boolean {
  if (!message) return false
  const normalized = message.toLowerCase()
  return (
    normalized.includes('already registered') ||
    normalized.includes('already been registered') ||
    normalized.includes('already exists') ||
    normalized.includes('user already')
  )
}

/**
 * An invitation may set a password only for an auth user created for that
 * invitation. Accounts that existed beforehand keep their password.
 */
export function mayClaimInvitedAuthUser(
  authUser: { created_at: string },
  invitationCreatedAt: string
): boolean {
  const created = new Date(authUser.created_at).getTime()
  const invited = new Date(invitationCreatedAt).getTime()
  if (Number.isNaN(created) || Number.isNaN(invited)) return false
  return created >= invited - 60_000
}

export function isMissingRpc(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'PGRST202') return true
  return (error.message || '').toLowerCase().includes('could not find the function')
}

/** PostgREST / Postgres error when a selected column is not in the live schema. */
export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  const message = (error.message || '').toLowerCase()
  return message.includes('column') && message.includes('does not exist')
}

/**
 * Turn a Supabase auth failure into a message the login form can show.
 * The project host is included so a preview pointed at the wrong project
 * is distinguishable from a bad password.
 */
export function presentAuthError(message: string | undefined, supabaseUrl?: string): string {
  const text = (message || 'Something went wrong. Please try again.').trim()
  let host = ''
  if (supabaseUrl) {
    try {
      host = new URL(supabaseUrl).host
    } catch {
      host = ''
    }
  }
  const where = host ? ` (${host})` : ''

  if (/failed to fetch|networkerror|network request failed|load failed/i.test(text)) {
    return `Could not reach Supabase${where}. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the Vercel Preview environment to the same values as Production, then redeploy.`
  }
  if (/invalid api key|no api key found|invalid jwt/i.test(text)) {
    return `Supabase rejected the API key${where}. Set the Vercel Preview NEXT_PUBLIC_SUPABASE_ANON_KEY to the production anon key and redeploy.`
  }

  return host ? `${text}${where}` : text
}

export function isValidSubdomain(subdomain: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(subdomain)
}

/** Prefer NEXT_PUBLIC_SITE_URL. Fall back to localhost in dev, otherwise production. */
export function appOrigin(request?: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  if (configured) return configured

  if (request) {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
    if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
      const proto = request.headers.get('x-forwarded-proto') || 'http'
      return `${proto}://${host}`
    }
  }

  return 'https://protrack-app.vercel.app'
}
