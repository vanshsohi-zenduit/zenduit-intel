import asyncio
import logging
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import smtplib

from app.credentials import get_config

log = logging.getLogger(__name__)

_LEAD_READY_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:system-ui,-apple-system,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9">
<tr><td align="center" style="padding:40px 16px">
<table width="580" cellpadding="0" cellspacing="0"
       style="background:#ffffff;border-radius:10px;overflow:hidden;
              box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <!-- Header -->
  <tr><td style="background:#0d1b2a;padding:22px 36px">
    <span style="color:#10b981;font-weight:700;font-size:12px;letter-spacing:.1em;
                 text-transform:uppercase">Zenduit Intelligence</span>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:36px 36px 28px">
    <p style="margin:0 0 6px;font-size:24px;font-weight:700;color:#0d1b2a;line-height:1.2">
      {company_name} is ready to call
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#64748b;line-height:1.5">
      Hi {rep_name}, we&rsquo;ve completed intelligence research on this lead.
      Here&rsquo;s a quick snapshot:
    </p>
    <!-- Stats table -->
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #e8edf3;border-radius:8px;overflow:hidden;
                  margin-bottom:28px;font-size:14px">
      <tr style="background:#f8fafc">
        <td style="padding:11px 16px;color:#94a3b8;font-size:13px;width:38%">Industry</td>
        <td style="padding:11px 16px;color:#0d1b2a;font-weight:600">{industry}</td>
      </tr>
      <tr style="background:#ffffff">
        <td style="padding:11px 16px;color:#94a3b8;font-size:13px">HQ</td>
        <td style="padding:11px 16px;color:#0d1b2a;font-weight:600">{hq}</td>
      </tr>
      <tr style="background:#f8fafc">
        <td style="padding:11px 16px;color:#94a3b8;font-size:13px">Fleet Size</td>
        <td style="padding:11px 16px;color:#0d1b2a;font-weight:600">{fleet_size}</td>
      </tr>
      <tr style="background:#ffffff">
        <td style="padding:11px 16px;color:#94a3b8;font-size:13px">Fit Score</td>
        <td style="padding:11px 16px;font-weight:700;font-size:15px;color:#10b981">
          {score}/10
        </td>
      </tr>
    </table>
    <!-- Pain point callout -->
    <div style="padding:14px 18px;background:#fffbeb;border-left:3px solid #f59e0b;
                border-radius:0 6px 6px 0;margin-bottom:32px;font-size:14px;color:#44403c">
      <strong>Top Pain Point:</strong> {top_pain_point}
    </div>
    <!-- CTA -->
    <a href="{lead_url}"
       style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;
              padding:14px 30px;border-radius:7px;font-weight:700;font-size:15px;
              letter-spacing:.02em">
      View Full Brief &rarr;
    </a>
  </td></tr>
  <!-- Footer -->
  <tr><td style="padding:18px 36px;background:#f8fafc;border-top:1px solid #e8edf3">
    <p style="margin:0;font-size:12px;color:#94a3b8">
      Zenduit Outbound Intelligence &bull; {date}
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""


def _sanitize_header(v: str) -> str:
    return v.replace("\r", "").replace("\n", "")


def _send_sync(to: str, subject: str, html: str):
    gmail_user = get_config("GMAIL_USER")
    gmail_pass = get_config("GMAIL_APP_PASSWORD")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = _sanitize_header(subject)
    msg["From"] = f"Zenduit Intel <{gmail_user}>"
    msg["To"] = _sanitize_header(to)
    msg.attach(MIMEText(html, "html", "utf-8"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as s:
        s.login(gmail_user, gmail_pass)
        s.sendmail(gmail_user, [to], msg.as_string())


async def _send(to: str, subject: str, html: str):
    if not get_config("GMAIL_USER") or not get_config("GMAIL_APP_PASSWORD"):
        log.info("Email not configured — skipping send to %s", to)
        return
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send_sync, to, subject, html)
        log.info("Email sent to %s: %s", to, subject)
    except Exception as e:
        log.warning("Email failed to %s: %s", to, e)


async def send_lead_ready(rep: dict, entry: dict):
    to = rep.get("email", "")
    if not to:
        return
    intel = entry.get("intel") or {}
    public_url = get_config("PUBLIC_APP_URL", "http://localhost:8080")
    html = _LEAD_READY_HTML.format(
        company_name=entry.get("companyName") or "—",
        rep_name=rep.get("name") or "there",
        industry=intel.get("industry") or "—",
        hq=intel.get("hq") or "—",
        fleet_size=intel.get("fleetSize") or "—",
        score=intel.get("score") or "—",
        top_pain_point=intel.get("topPainPoint") or "—",
        lead_url=f"{public_url}/lead/{entry.get('id','')}",
        date=datetime.utcnow().strftime("%b %d, %Y"),
    )
    company = entry.get("companyName") or ""
    score = intel.get("score") or "?"
    await _send(to, f"{company} is ready to call (Score: {score}/10)", html)


async def send_overdue(manager_email: str, rep_name: str, company: str, task_url: str):
    if not manager_email:
        return
    html = (
        f"<p>Hi,</p>"
        f"<p><strong>{rep_name}</strong> has not yet called <strong>{company}</strong> "
        f"&mdash; the ClickUp task is overdue.</p>"
        f'<p><a href="{task_url}" style="color:#10b981">View task in ClickUp &rarr;</a></p>'
        f"<p style='color:#94a3b8;font-size:13px'>— Zenduit Outbound Intelligence</p>"
    )
    await _send(
        manager_email,
        f"Action needed: {rep_name} has not called {company}",
        html,
    )
