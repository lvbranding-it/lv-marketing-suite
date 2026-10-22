// Official LV Branding logo — PNG for Gmail/all clients, SVG for high-res fallback
const LV_LOGO_URL = "https://lv-marketing-suite.vercel.app/lv-logo.png";

export function wrapHtml(bodyHtml: string, unsubUrl: string | null): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title></title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px 0;">
      <table role="presentation" style="max-width:600px;width:100%;" cellpadding="0" cellspacing="0">

        <!-- ── Logo ── -->
        <tr><td align="center" style="padding:0 0 28px;">
          <a href="https://www.lvbranding.com" target="_blank" style="text-decoration:none;display:block;">
            <img
              src="${LV_LOGO_URL}"
              alt="LV Branding"
              width="80" height="80"
              style="display:block;margin:0 auto;width:80px;height:80px;border:0;"
            />
          </a>
        </td></tr>

        <!-- ── Body card ── -->
        <!-- The 32px horizontal inset is what a full-bleed image cancels with a
             negative margin. It is EMAIL_SIDE_PADDING in
             src/lib/campaigns/email-layout.ts — change both or neither, or
             edge-to-edge images will sit a few pixels off the edge. -->
        <tr><td style="background:#ffffff;border-radius:12px;padding:36px 32px;border:1px solid #e4e4e7;line-height:1.75;color:#231F20;font-size:15px;">
          ${bodyHtml}
        </td></tr>

        <!-- ── Footer ── -->
        <tr><td align="center" style="padding:24px 0 32px;font-size:12px;line-height:2;">
          <p style="margin:0 0 4px;color:#374151;">
            <a href="https://www.lvbranding.com" target="_blank" style="color:#CB2039;text-decoration:none;font-weight:700;">LV Branding</a>
            &nbsp;&middot;&nbsp;Houston, TX
          </p>
          ${unsubUrl ? `<p style="margin:0 0 6px;color:#4B5563;">
            <a href="${unsubUrl}" style="color:#4B5563;text-decoration:underline;">Unsubscribe</a>
            &nbsp;&middot;&nbsp;You're receiving this as a valued contact.
          </p>` : ''}
          <p style="margin:0;font-size:11px;color:#6B7280;">
            Made with ❤️ by
            <a href="https://www.lvbranding.com" target="_blank" style="color:#CB2039;text-decoration:none;font-weight:600;">LV Branding</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

