export interface ReportEmailInput {
  company: string
  reportName: string
  rangeLabel: string
  headlines: Array<{ label: string; value: string }>
  openUrl: string
  attachments: string[]
  ownerName: string
  scheduleName: string
  unsubscribeUrl: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderReportEmail(input: ReportEmailInput): { subject: string; html: string; text: string } {
  const subject = `${input.reportName}: ${input.rangeLabel}`
  const headlines = input.headlines.slice(0, 4)
  const text = [
    `${input.company}`,
    `${input.reportName}`,
    input.rangeLabel,
    '',
    ...headlines.map((item) => `${item.label}: ${item.value}`),
    '',
    `Open in ProTrack: ${input.openUrl}`,
    '',
    input.attachments.length ? `Attached: ${input.attachments.join(', ')}` : '',
    '',
    `You get this because ${input.ownerName} added you to ${input.scheduleName}.`,
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ].filter((line) => line !== '').join('\n')

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#fafafa;color:#18181b;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;">
            <tr><td style="padding:28px 28px 8px;font-size:20px;font-weight:650;letter-spacing:-0.02em;color:#1e40af;">ProTrack</td></tr>
            <tr><td style="padding:8px 28px 0;font-size:13px;color:#52525b;">${escapeHtml(input.company)}</td></tr>
            <tr><td style="padding:4px 28px 0;font-size:18px;font-weight:650;">${escapeHtml(input.reportName)}</td></tr>
            <tr><td style="padding:4px 28px 0;font-size:14px;color:#52525b;">${escapeHtml(input.rangeLabel)}</td></tr>
            <tr><td style="padding:16px 28px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${headlines.map((item) => `<tr><td style="padding:4px 0;font-size:14px;">${escapeHtml(item.label)}</td><td style="padding:4px 0;font-size:14px;font-weight:650;text-align:right;">${escapeHtml(item.value)}</td></tr>`).join('')}
              </table>
            </td></tr>
            <tr><td style="padding:20px 28px;"><a href="${escapeHtml(input.openUrl)}" style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 18px;font-size:14px;font-weight:600;">Open in ProTrack</a></td></tr>
            <tr><td style="padding:0 28px 8px;font-size:13px;color:#52525b;">Attached: ${escapeHtml(input.attachments.join(', ') || 'none')}</td></tr>
            <tr><td style="padding:8px 28px 28px;font-size:12px;line-height:1.5;color:#71717a;">You get this because ${escapeHtml(input.ownerName)} added you to ${escapeHtml(input.scheduleName)}. <a href="${escapeHtml(input.unsubscribeUrl)}">Unsubscribe</a>.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
  return { subject, html, text }
}
