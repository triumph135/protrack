import { Resend } from 'resend'
import { renderInviteEmail } from './invite'
import { inviteJoinUrl, roleLabel } from '../invites'
import { appOrigin } from '../security'

export async function deliverInviteEmail(input: {
  request?: Request
  email: string
  token: string
  company: string
  inviter: string
  role: string
  expires: string
}): Promise<{ sent: boolean; link: string }> {
  const link = inviteJoinUrl(appOrigin(input.request), input.token)
  if (!process.env.RESEND_API_KEY || !input.email) {
    return { sent: false, link }
  }

  const message = renderInviteEmail({
    company: input.company,
    inviter: input.inviter,
    role: roleLabel(input.role),
    url: link,
    expires: input.expires,
  })
  const resend = new Resend(process.env.RESEND_API_KEY)
  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM || 'ProTrack <invites@protrackusa.com>',
    to: input.email,
    subject: message.subject,
    html: message.html,
    text: message.text,
  })
  if (result.error) {
    console.error('Resend error', result.error)
    return { sent: false, link }
  }
  return { sent: true, link }
}
