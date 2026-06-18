import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.services import email_service
from app.services.email_service import EmailDeliveryError


class EmailServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.user = SimpleNamespace(email="user@example.com")

    def test_log_provider_logs_verification_link_without_network(self) -> None:
        resend_module = SimpleNamespace(
            Emails=SimpleNamespace(send=Mock()),
            api_key=None,
        )

        with (
            patch.object(settings, "email_provider", "log"),
            patch.object(settings, "frontend_url", "http://localhost:5173"),
            patch.dict(sys.modules, {"resend": resend_module}),
            patch("app.services.email_service.logger.info") as log_info,
        ):
            email_service.send_verification_email(self.user, "raw token")

        resend_module.Emails.send.assert_not_called()
        log_info.assert_called_once()
        log_message = log_info.call_args.args
        self.assertEqual(log_message[0], "%s for %s: %s")
        self.assertEqual(log_message[1], "Verify your SoundSpot email")
        self.assertEqual(log_message[2], self.user.email)
        self.assertEqual(
            log_message[3],
            "http://localhost:5173/verify-email?token=raw+token",
        )

    def test_resend_verification_email_uses_expected_subject_and_link(self) -> None:
        send = Mock(return_value={"id": "email_id"})
        resend_module = SimpleNamespace(
            Emails=SimpleNamespace(send=send),
            api_key=None,
        )

        with (
            patch.object(settings, "email_provider", "resend"),
            patch.object(settings, "resend_api_key", "test_resend_key"),
            patch.object(settings, "email_from", "SoundSpot <onboarding@resend.dev>"),
            patch.object(settings, "frontend_url", "https://soundspot.vercel.app"),
            patch.dict(sys.modules, {"resend": resend_module}),
        ):
            email_service.send_verification_email(self.user, "verify-token")

        send.assert_called_once()
        payload = send.call_args.args[0]
        self.assertEqual(resend_module.api_key, "test_resend_key")
        self.assertEqual(payload["from"], "SoundSpot <onboarding@resend.dev>")
        self.assertEqual(payload["to"], [self.user.email])
        self.assertEqual(payload["subject"], "Verify your SoundSpot email")
        self.assertIn(
            "https://soundspot.vercel.app/verify-email?token=verify-token",
            payload["html"],
        )
        self.assertIn(
            "https://soundspot.vercel.app/verify-email?token=verify-token",
            payload["text"],
        )
        self.assertIn("Thanks for creating a SoundSpot account.", payload["text"])

    def test_resend_password_reset_email_uses_expected_subject_and_link(self) -> None:
        send = Mock(return_value={"id": "email_id"})
        resend_module = SimpleNamespace(
            Emails=SimpleNamespace(send=send),
            api_key=None,
        )

        with (
            patch.object(settings, "email_provider", "resend"),
            patch.object(settings, "resend_api_key", "test_resend_key"),
            patch.object(settings, "email_from", "SoundSpot <onboarding@resend.dev>"),
            patch.object(settings, "frontend_url", "https://soundspot.vercel.app/"),
            patch.dict(sys.modules, {"resend": resend_module}),
        ):
            email_service.send_password_reset_email(self.user, "reset-token")

        send.assert_called_once()
        payload = send.call_args.args[0]
        self.assertEqual(payload["subject"], "Reset your SoundSpot password")
        self.assertIn(
            "https://soundspot.vercel.app/reset-password?token=reset-token",
            payload["html"],
        )
        self.assertIn(
            "https://soundspot.vercel.app/reset-password?token=reset-token",
            payload["text"],
        )
        self.assertIn("We received a request to reset your password.", payload["text"])

    def test_resend_provider_requires_api_key(self) -> None:
        send = Mock()
        resend_module = SimpleNamespace(
            Emails=SimpleNamespace(send=send),
            api_key=None,
        )

        with (
            patch.object(settings, "email_provider", "resend"),
            patch.object(settings, "resend_api_key", ""),
            patch.object(settings, "email_from", "SoundSpot <onboarding@resend.dev>"),
            patch.dict(sys.modules, {"resend": resend_module}),
            patch("app.services.email_service.logger.error") as log_error,
        ):
            with self.assertRaises(EmailDeliveryError):
                email_service.send_password_reset_email(self.user, "reset-token")

        send.assert_not_called()
        log_error.assert_called_once_with(
            "EMAIL_PROVIDER=resend requires RESEND_API_KEY to send email."
        )


if __name__ == "__main__":
    unittest.main()
