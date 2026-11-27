import { EMAIL_LOG, type EmailTransport } from './email-mode'

export const ATTACHMENT_LIMIT_BYTES = 10 * 1024 * 1024
export const SEND_GAP_MS = 600

export interface DeliveryWork {
  id: string
  userId: string
  email: string
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'
  error: string | null
  resendId: string | null
  unsubscribed: boolean
  inactive: boolean
  emptyScope: boolean
}

export interface RenderedMail {
  subject: string
  html: string
  text: string
  attachments: Array<{ filename: string; content: Uint8Array }>
  bytes: number
}

export interface SendRequest {
  idempotencyKey: string
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
  headers: Record<string, string>
  attachments: Array<{ filename: string; content: Uint8Array }>
}

export type RunOutcome = 'sent' | 'partial' | 'failed' | 'skipped'

export function runOutcome(deliveries: Array<Pick<DeliveryWork, 'status'>>): RunOutcome {
  if (deliveries.length === 0) return 'skipped'
  const sent = deliveries.filter((row) => row.status === 'sent').length
  const skipped = deliveries.filter((row) => row.status === 'skipped').length
  if (sent === deliveries.length) return 'sent'
  if (sent > 0) return 'partial'
  if (skipped === deliveries.length) return 'skipped'
  return 'failed'
}

export function scopeHash(parts: { projects: string[]; categories: string[]; invoices: boolean }): string {
  return JSON.stringify({
    projects: [...parts.projects].sort(),
    categories: [...parts.categories].sort(),
    invoices: parts.invoices,
  })
}

/**
 * Applies one delivery. The idempotency key is always the delivery id so a retry cannot double-send.
 * Returns the next status. Does not throw for a missing API key.
 */
export async function applyDelivery(input: {
  delivery: DeliveryWork
  transport: EmailTransport
  render: () => Promise<RenderedMail>
  send: (request: SendRequest) => Promise<{ id: string | null; error?: string }>
  replyTo?: string
  headers: Record<string, string>
}): Promise<DeliveryWork> {
  const current = input.delivery
  if (current.unsubscribed || current.inactive) {
    return { ...current, status: 'skipped', error: current.unsubscribed ? 'Unsubscribed' : 'Recipient is not active' }
  }
  if (current.emptyScope) {
    return { ...current, status: 'skipped', error: 'Nothing this person can see' }
  }
  if (input.transport.kind === 'unconfigured') {
    return { ...current, status: 'skipped', error: input.transport.reason }
  }
  if (input.transport.kind === 'off') {
    return { ...current, status: 'skipped', error: input.transport.reason }
  }

  let rendered: RenderedMail
  try {
    rendered = await input.render()
  } catch (error) {
    return { ...current, status: 'failed', error: error instanceof Error ? error.message : 'Could not build the report' }
  }
  if (rendered.bytes > ATTACHMENT_LIMIT_BYTES) {
    return { ...current, status: 'failed', error: 'Report too large to email; narrow the filters' }
  }

  if (input.transport.kind === 'log') {
    console.info('report email log', {
      to: current.email,
      subject: rendered.subject,
      bytes: rendered.attachments.map((file) => ({ name: file.filename, bytes: file.content.byteLength })),
    })
    return { ...current, status: 'sent', error: EMAIL_LOG, resendId: null }
  }

  const result = await input.send({
    idempotencyKey: current.id,
    to: current.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    replyTo: input.replyTo,
    headers: input.headers,
    attachments: rendered.attachments,
  })
  if (result.error) return { ...current, status: 'failed', error: result.error.slice(0, 300) }
  return { ...current, status: 'sent', error: null, resendId: result.id }
}
