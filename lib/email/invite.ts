export interface InviteEmailInput {
  company: string
  inviter: string
  role: string
  url: string
  expires: string
}

export function renderInviteEmail(input: InviteEmailInput): { subject: string; html: string; text: string } {
  const role = input.role === 'master' ? 'Master' : input.role === 'view' ? 'Viewer' : 'Project Manager'
  const subject = `Join ${input.company} on ProTrack`
  const text = [
    `${input.inviter} invited you to ${input.company} on ProTrack as a ${role}.`,
    '',
    `Join: ${input.url}`,
    '',
    `This invite expires on ${input.expires}.`,
  ].join('\n')

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#fafafa;color:#18181b;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;">
            <tr>
              <td style="padding:28px 28px 8px;font-size:20px;font-weight:650;letter-spacing:-0.02em;color:#1e40af;">ProTrack</td>
            </tr>
            <tr>
              <td style="padding:8px 28px 0;font-size:16px;line-height:1.5;">
                ${escapeHtml(input.inviter)} invited you to <strong>${escapeHtml(input.company)}</strong> as a ${escapeHtml(role)}.
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;">
                <a href="${escapeHtml(input.url)}" style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 18px;font-size:14px;font-weight:600;">Join ${escapeHtml(input.company)} on ProTrack</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;font-size:13px;line-height:1.5;color:#52525b;">
                This invite expires on ${escapeHtml(input.expires)}.<br />
                If the button does not work, copy this link:<br />
                <span style="word-break:break-all;">${escapeHtml(input.url)}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
