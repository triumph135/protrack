export const EMAIL_NOT_SET_UP = "Email isn't set up yet"
export const EMAIL_OFF = 'Email sending is off in this environment'
export const EMAIL_LOG = 'log mode'

export type EmailTransport =
  | { kind: 'log' }
  | { kind: 'off'; reason: string }
  | { kind: 'unconfigured'; reason: string }
  | { kind: 'send'; apiKey: string; from: string }

export function reportsFromAddress(env: NodeJS.ProcessEnv = process.env): string {
  return env.REPORTS_EMAIL_FROM || 'ProTrack Reports <reports@protrackusa.com>'
}

/**
 * log: tests and preview. The message is written to the server log and the delivery is marked sent.
 * off, with a Resend key present: skipped, nothing is sent.
 * Missing RESEND_API_KEY (mode off or send): skipped with a clear reason. Send now shows that same sentence.
 */
export function resolveEmailTransport(env: NodeJS.ProcessEnv = process.env): EmailTransport {
  const mode = (env.REPORTS_EMAIL_MODE || 'off').trim().toLowerCase()
  const apiKey = env.RESEND_API_KEY?.trim() || ''
  if (mode === 'log') return { kind: 'log' }
  if (mode === 'send' && apiKey) return { kind: 'send', apiKey, from: reportsFromAddress(env) }
  if (!apiKey) return { kind: 'unconfigured', reason: EMAIL_NOT_SET_UP }
  return { kind: 'off', reason: EMAIL_OFF }
}
