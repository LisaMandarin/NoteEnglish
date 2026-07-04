import smtplib
from email.mime.text import MIMEText

from app.core.config import settings


def send_email(subject: str, body: str) -> None:
    if not settings.smtp_user or not settings.smtp_password:
        raise RuntimeError("SMTP is not configured (SMTP_USER / SMTP_PASSWORD missing).")

    message = MIMEText(body, "plain", "utf-8")
    message["Subject"] = subject
    message["From"] = settings.smtp_user
    message["To"] = settings.issue_report_recipient

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(message)
