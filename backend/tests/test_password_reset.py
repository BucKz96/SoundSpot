import sys
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.rate_limit import clear_rate_limit_store
from app.core.security import verify_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.auth_token import AuthToken
from app.models.user import User
from app.services.auth_token_service import get_valid_token, hash_token


GENERIC_RESET_MESSAGE = "If an account exists, a reset email has been sent."


class PasswordResetRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite+pysqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.TestSessionLocal = sessionmaker(
            bind=cls.engine,
            autoflush=False,
            expire_on_commit=False,
        )
        Base.metadata.create_all(bind=cls.engine)

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        clear_rate_limit_store()
        with self.engine.begin() as connection:
            for table in reversed(Base.metadata.sorted_tables):
                connection.execute(table.delete())

        self.original_secret = settings.jwt_secret_key
        self.original_app_env = settings.app_env
        self.original_email_provider = settings.email_provider
        settings.jwt_secret_key = "test-secret-key-with-at-least-32-bytes"
        settings.app_env = "development"
        settings.email_provider = "log"

        def override_get_db():
            db = self.TestSessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        clear_rate_limit_store()
        self.client.close()
        app.dependency_overrides.clear()
        settings.jwt_secret_key = self.original_secret
        settings.app_env = self.original_app_env
        settings.email_provider = self.original_email_provider

    def register(
        self,
        email: str = "reset@example.com",
        password: str = "password123",
    ):
        return self.client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": password,
                "display_name": "Reset User",
            },
        )

    def forgot_password(self, email: str = "reset@example.com"):
        return self.client.post(
            "/api/auth/forgot-password",
            json={"email": email},
        )

    def reset_password(self, token: str, password: str = "newpassword123"):
        return self.client.post(
            "/api/auth/reset-password",
            json={"token": token, "password": password},
        )

    def test_forgot_password_returns_generic_message_for_existing_email(self) -> None:
        self.register()
        sent_tokens = []

        with patch(
            "app.api.routes.auth.email_service.send_password_reset_email",
            side_effect=lambda user, raw_token: sent_tokens.append(raw_token),
        ):
            response = self.forgot_password(email=" RESET@example.com ")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], GENERIC_RESET_MESSAGE)
        self.assertEqual(len(sent_tokens), 1)

    def test_forgot_password_returns_same_message_for_unknown_email(self) -> None:
        with patch(
            "app.api.routes.auth.email_service.send_password_reset_email"
        ) as send_email:
            response = self.forgot_password(email="missing@example.com")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], GENERIC_RESET_MESSAGE)
        send_email.assert_not_called()
        with Session(self.engine) as db:
            reset_tokens = db.scalars(
                select(AuthToken).where(AuthToken.purpose == "password_reset")
            ).all()

        self.assertEqual(reset_tokens, [])

    def test_forgot_password_creates_password_reset_token_without_raw_storage(self) -> None:
        self.register()
        sent_tokens = []

        with patch(
            "app.api.routes.auth.email_service.send_password_reset_email",
            side_effect=lambda user, raw_token: sent_tokens.append(raw_token),
        ):
            response = self.forgot_password()

        self.assertEqual(response.status_code, 200)
        with Session(self.engine) as db:
            reset_token = db.scalar(
                select(AuthToken).where(AuthToken.purpose == "password_reset")
            )

        self.assertIsNotNone(reset_token)
        self.assertNotEqual(reset_token.token_hash, sent_tokens[0])
        self.assertEqual(reset_token.token_hash, hash_token(sent_tokens[0]))

    def test_forgot_password_invalidates_previous_password_reset_token(self) -> None:
        self.register()
        sent_tokens = []

        with patch(
            "app.api.routes.auth.email_service.send_password_reset_email",
            side_effect=lambda user, raw_token: sent_tokens.append(raw_token),
        ):
            self.forgot_password()
            self.forgot_password()

        with Session(self.engine) as db:
            first_token = get_valid_token(db, sent_tokens[0], "password_reset")
            second_token = get_valid_token(db, sent_tokens[1], "password_reset")

        self.assertIsNone(first_token)
        self.assertIsNotNone(second_token)

    def test_forgot_password_email_failure_still_returns_generic_message(self) -> None:
        self.register()

        with (
            patch(
                "app.api.routes.auth.email_service.send_password_reset_email",
                side_effect=RuntimeError("email unavailable"),
            ),
            patch("app.api.routes.auth.logger.exception"),
        ):
            response = self.forgot_password()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], GENERIC_RESET_MESSAGE)
        with Session(self.engine) as db:
            reset_token = db.scalar(
                select(AuthToken).where(AuthToken.purpose == "password_reset")
            )

        self.assertIsNotNone(reset_token)

    def test_reset_password_success_updates_hash_and_consumes_token(self) -> None:
        self.register(password="oldpassword123")
        sent_tokens = []

        with patch(
            "app.api.routes.auth.email_service.send_password_reset_email",
            side_effect=lambda user, raw_token: sent_tokens.append(raw_token),
        ):
            self.forgot_password()

        response = self.reset_password(sent_tokens[0], "newpassword123")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "Password updated.")
        with Session(self.engine) as db:
            user = db.scalar(select(User).where(User.email == "reset@example.com"))
            reset_token = db.scalar(
                select(AuthToken).where(AuthToken.purpose == "password_reset")
            )
            reused_token = get_valid_token(db, sent_tokens[0], "password_reset")

        self.assertTrue(verify_password("newpassword123", user.hashed_password))
        self.assertFalse(verify_password("oldpassword123", user.hashed_password))
        self.assertIsNotNone(reset_token.used_at)
        self.assertIsNone(reused_token)

    def test_reset_password_token_cannot_be_reused(self) -> None:
        self.register(password="oldpassword123")
        sent_tokens = []

        with patch(
            "app.api.routes.auth.email_service.send_password_reset_email",
            side_effect=lambda user, raw_token: sent_tokens.append(raw_token),
        ):
            self.forgot_password()

        first_response = self.reset_password(sent_tokens[0], "newpassword123")
        second_response = self.reset_password(sent_tokens[0], "anotherpass123")
        first_new_login = self.client.post(
            "/api/auth/login",
            json={"email": "reset@example.com", "password": "newpassword123"},
        )
        second_new_login = self.client.post(
            "/api/auth/login",
            json={"email": "reset@example.com", "password": "anotherpass123"},
        )

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 400)
        self.assertEqual(first_new_login.status_code, 200)
        self.assertEqual(second_new_login.status_code, 401)

    def test_reset_password_refuses_invalid_token(self) -> None:
        response = self.reset_password("invalid-token")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "Invalid or expired password reset token.",
        )

    def test_reset_password_refuses_expired_token(self) -> None:
        self.register()
        sent_tokens = []

        with patch(
            "app.api.routes.auth.email_service.send_password_reset_email",
            side_effect=lambda user, raw_token: sent_tokens.append(raw_token),
        ):
            self.forgot_password()

        with Session(self.engine) as db:
            reset_token = db.scalar(
                select(AuthToken).where(AuthToken.purpose == "password_reset")
            )
            reset_token.expires_at = datetime.now(UTC) - timedelta(minutes=1)
            db.commit()

        response = self.reset_password(sent_tokens[0])

        self.assertEqual(response.status_code, 400)

    def test_reset_password_refuses_email_verification_token(self) -> None:
        sent_tokens = []

        with patch(
            "app.api.routes.auth.email_service.send_verification_email",
            side_effect=lambda user, raw_token: sent_tokens.append(raw_token),
        ):
            self.register()

        response = self.reset_password(sent_tokens[0])

        self.assertEqual(response.status_code, 400)

    def test_login_uses_new_password_after_reset(self) -> None:
        self.register(password="oldpassword123")
        sent_tokens = []

        with patch(
            "app.api.routes.auth.email_service.send_password_reset_email",
            side_effect=lambda user, raw_token: sent_tokens.append(raw_token),
        ):
            self.forgot_password()

        self.reset_password(sent_tokens[0], "newpassword123")
        old_login = self.client.post(
            "/api/auth/login",
            json={"email": "reset@example.com", "password": "oldpassword123"},
        )
        new_login = self.client.post(
            "/api/auth/login",
            json={"email": "reset@example.com", "password": "newpassword123"},
        )

        self.assertEqual(old_login.status_code, 401)
        self.assertEqual(new_login.status_code, 200)


if __name__ == "__main__":
    unittest.main()
