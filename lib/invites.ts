const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,200}$/

export function inviteJoinPath(token: string): string {
  return `/join?token=${encodeURIComponent(token)}`
}

export function inviteJoinUrl(origin: string, token: string): string {
  const base = origin.replace(/\/$/, '')
  return `${base}${inviteJoinPath(token)}`
}

export function roleLabel(role: string | null | undefined): string {
  if (role === 'master') return 'Master'
  if (role === 'view') return 'Viewer'
  return 'Project Manager'
}

export function describeInviteTarget(invite: { invite_type?: string | null; email?: string | null }): string {
  if (invite.invite_type === 'link' || !invite.email) return 'Link'
  return invite.email
}

export function assertInviteToken(token: string | null | undefined): string {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    throw new Error('That invite link is not valid')
  }
  return token
}
