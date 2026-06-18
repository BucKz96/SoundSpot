import logging
from html import escape
from urllib.parse import urlencode

from app.core.config import settings
from app.models.user import User

logger = logging.getLogger("uvicorn.error")


class EmailDeliveryError(RuntimeError):
    """Raised when the configured email provider cannot send a message."""


def _configured_provider() -> str:
    return settings.email_provider.strip().casefold() or "log"


def build_email_verification_url(raw_token: str) -> str:
    frontend_url = settings.frontend_url.strip().rstrip("/")
    query = urlencode({"token": raw_token})
    return f"{frontend_url}/verify-email?{query}"


def build_password_reset_url(raw_token: str) -> str:
    frontend_url = settings.frontend_url.strip().rstrip("/")
    query = urlencode({"token": raw_token})
    return f"{frontend_url}/reset-password?{query}"


def _build_html_email(
    title: str,
    body: str,
    action_label: str,
    action_url: str,
    note: str,
) -> str:
    safe_title = escape(title)
    safe_body = escape(body)
    safe_action_label = escape(action_label)
    safe_action_url = escape(action_url, quote=True)
    safe_note = escape(note)
    button_style = (
        "display: inline-block; padding: 10px 16px; background: #111827; "
        "color: #ffffff; text-decoration: none; border-radius: 6px;"
    )
    return f"""\
<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
    <h1>{safe_title}</h1>
    <p>{safe_body}</p>
    <p>
      <a href="{safe_action_url}" style="{button_style}">
        {safe_action_label}
      </a>
    </p>
    <p>If the button does not work, copy and paste this link into your browser:</p>
    <p><a href="{safe_action_url}">{safe_action_url}</a></p>
    <p>{safe_note}</p>
  </body>
</html>
"""


def _build_text_email(
    title: str,
    body: str,
    action_label: str,
    action_url: str,
    note: str,
) -> str:
    return "\n\n".join(
        [
            title,
            body,
            f"{action_label}: {action_url}",
            note,
        ]
    )


def _send_resend_email(
    *,
    to_email: str,
    subject: str,
    html: str,
    text: str,
) -> None:
    api_key = settings.resend_api_key.strip()
    if not api_key:
        logger.error("EMAIL_PROVIDER=resend requires RESEND_API_KEY to send email.")
        raise EmailDeliveryError("RESEND_API_KEY is required for Resend email delivery.")

    email_from = settings.email_from.strip()
    if not email_from:
        logger.error("EMAIL_PROVIDER=resend requires EMAIL_FROM to send email.")
        raise EmailDeliveryError("EMAIL_FROM is required for Resend email delivery.")

    try:
        import resend

        resend.api_key = api_key
        resend.Emails.send(
            {
                "from": email_from,
                "to": [to_email],
                "subject": subject,
                "html": html,
                "text": text,
            }
        )
    except EmailDeliveryError:
        raise
    except Exception as exc:
        logger.exception("Resend failed to send email to %s.", to_email)
        raise EmailDeliveryError("Resend email delivery failed.") from exc


def _send_transactional_email(
    *,
    to_email: str,
    subject: str,
    title: str,
    body: str,
    action_label: str,
    action_url: str,
    note: str,
) -> None:
    provider = _configured_provider()

    if provider == "log":
        logger.info("%s for %s: %s", subject, to_email, action_url)
        return

    html = _build_html_email(title, body, action_label, action_url, note)
    text = _build_text_email(title, body, action_label, action_url, note)

    if provider == "resend":
        _send_resend_email(
            to_email=to_email,
            subject=subject,
            html=html,
            text=text,
        )
        return

    logger.warning(
        "Email provider %r is not implemented; %s for %s: %s",
        provider,
        subject,
        to_email,
        action_url,
    )


def send_verification_email(user: User, raw_token: str) -> None:
    verification_url = build_email_verification_url(raw_token)
    _send_transactional_email(
        to_email=user.email,
        subject="Verify your SoundSpot email",
        title="Verify your SoundSpot email",
        body="Thanks for creating a SoundSpot account.",
        action_label="Verify email",
        action_url=verification_url,
        note="If you did not create this account, you can ignore this email.",
    )


def send_password_reset_email(user: User, raw_token: str) -> None:
    reset_url = build_password_reset_url(raw_token)
    _send_transactional_email(
        to_email=user.email,
        subject="Reset your SoundSpot password",
        title="Reset your SoundSpot password",
        body="We received a request to reset your password.",
        action_label="Reset password",
        action_url=reset_url,
        note="If you did not request this, you can ignore this email.",
    )
