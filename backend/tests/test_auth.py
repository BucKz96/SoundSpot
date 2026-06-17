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
from app.core.security import AUTH_COOKIE_NAME, verify_password
from app.db.base import Base
from app.db.session import get_db
from app.models.auth_token import AuthToken
from app.main import app
from app.models.user import User
from app.services.auth_token_service import get_valid_token, hash_token


class AuthenticationRouteTests(unittest.TestCase):
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
        with self.engine.begin() as connection:
            for table in reversed(Base.metadata.sorted_tables):
                connection.execute(table.delete())

        self.original_secret = settings.jwt_secret_key
        self.original_app_env = settings.app_env
        self.original_email_provider = settings.email_provider
        self.original_frontend_url = settings.frontend_url
        settings.jwt_secret_key = "test-secret-key-with-at-least-32-bytes"
        settings.app_env = "development"
        settings.email_provider = "log"
        settings.frontend_url = "http://localhost:5173"

        def override_get_db():
            db = self.TestSessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        app.dependency_overrides.clear()
        settings.jwt_secret_key = self.original_secret
        settings.app_env = self.original_app_env
        settings.email_provider = self.original_email_provider
        settings.frontend_url = self.original_frontend_url

    def register(
        self,
        email: str = "test@example.com",
        password: str = "password123",
        display_name: str = "Test User",
    ):
        return self.client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": password,
                "display_name": display_name,
            },
        )

    def test_register_success_sets_cookie_and_returns_public_user(self) -> None:
        response = self.register(email="  TEST@Example.com  ")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["user"]["email"], "test@example.com")
        self.assertFalse(response.json()["user"]["is_email_verified"])
        self.assertIsNone(response.json()["user"]["email_verified_at"])
        self.assertEqual(
            response.json()["message"],
            "Account created. Please verify your email.",
        )
        self.assertNotIn("hashed_password", response.json()["user"])
        self.assertIn(AUTH_COOKIE_NAME, response.cookies)
        self.assertIn(
            "httponly",
            response.headers["set-cookie"].casefold(),
        )

    def test_register_creates_email_verification_token(self) -> None:
        sent_tokens = []

        def capture_token(user, raw_token):
            sent_tokens.append(raw_token)

        with patch(
            "app.api.routes.auth.email_service.send_verification_email",
            side_effect=capture_token,
        ):
            response = self.register()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(sent_tokens), 1)
        with Session(self.engine) as db:
            stored_token = db.scalar(select(AuthToken))

        self.assertIsNotNone(stored_token)
        self.assertEqual(stored_token.purpose, "email_verification")
        self.assertNotEqual(stored_token.token_hash, sent_tokens[0])
        self.assertEqual(stored_token.token_hash, hash_token(sent_tokens[0]))

    def test_register_succeeds_when_verification_email_fails(self) -> None:
        with (
            patch(
                "app.api.routes.auth.email_service.send_verification_email",
                side_effect=RuntimeError("email unavailable"),
            ),
            patch("app.api.routes.auth.logger.exception"),
        ):
            response = self.register()

        self.assertEqual(response.status_code, 201)
        with Session(self.engine) as db:
            stored_token = db.scalar(select(AuthToken))

        self.assertIsNotNone(stored_token)

    def test_register_duplicate_email_returns_409(self) -> None:
        self.register(email="duplicate@example.com")

        response = self.register(email="DUPLICATE@example.com")

        self.assertEqual(response.status_code, 409)

    def test_register_password_too_short_returns_422(self) -> None:
        response = self.register(password="short")

        self.assertEqual(response.status_code, 422)

    def test_password_is_hashed_and_never_stored_in_plain_text(self) -> None:
        password = "password123"
        response = self.register(password=password)

        self.assertEqual(response.status_code, 201)
        with Session(self.engine) as db:
            user = db.scalar(
                select(User).where(User.email == "test@example.com")
            )

        self.assertIsNotNone(user)
        self.assertFalse(user.is_email_verified)
        self.assertNotEqual(user.hashed_password, password)
        self.assertTrue(verify_password(password, user.hashed_password))

    def test_login_success_sets_cookie(self) -> None:
        self.register()
        self.client.cookies.clear()

        response = self.client.post(
            "/api/auth/login",
            json={"email": "TEST@example.com", "password": "password123"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn(AUTH_COOKIE_NAME, response.cookies)

    def test_login_wrong_password_returns_generic_401(self) -> None:
        self.register()
        self.client.cookies.clear()

        response = self.client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "wrong-password"},
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Invalid email or password.")

    def test_me_authenticated_returns_current_user(self) -> None:
        self.register()

        response = self.client.get("/api/auth/me")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["email"], "test@example.com")
        self.assertFalse(response.json()["is_email_verified"])

    def test_verify_email_success_marks_user_verified_and_consumes_token(self) -> None:
        sent_tokens = []

        with patch(
            "app.api.routes.auth.email_service.send_verification_email",
            side_effect=lambda user, raw_token: sent_tokens.append(raw_token),
        ):
            self.assertEqual(self.register().status_code, 201)

        response = self.client.post(
            "/api/auth/verify-email",
            json={"token": sent_tokens[0]},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "Email verified.")
        self.assertTrue(response.json()["user"]["is_email_verified"])
        self.assertIsNotNone(response.json()["user"]["email_verified_at"])
        with Session(self.engine) as db:
            user = db.scalar(select(User).where(User.email == "test@example.com"))
            stored_token = db.scalar(select(AuthToken))
            reused_token = get_valid_token(
                db,
                sent_tokens[0],
                "email_verification",
            )

        self.assertTrue(user.is_email_verified)
        self.assertIsNotNone(user.email_verified_at)
        self.assertIsNotNone(stored_token.used_at)
        self.assertIsNone(reused_token)

    def test_verify_email_refuses_invalid_token(self) -> None:
        response = self.client.post(
            "/api/auth/verify-email",
            json={"token": "invalid-token"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "Invalid or expired verification token.",
        )

    def test_verify_email_refuses_expired_token(self) -> None:
        sent_tokens = []

        with patch(
            "app.api.routes.auth.email_service.send_verification_email",
            side_effect=lambda user, raw_token: sent_tokens.append(raw_token),
        ):
            self.register()

        with Session(self.engine) as db:
            stored_token = db.scalar(select(AuthToken))
            stored_token.expires_at = datetime.now(UTC) - timedelta(minutes=1)
            db.commit()

        response = self.client.post(
            "/api/auth/verify-email",
            json={"token": sent_tokens[0]},
        )

        self.assertEqual(response.status_code, 400)

    def test_verify_email_refuses_used_token(self) -> None:
        sent_tokens = []

        with patch(
            "app.api.routes.auth.email_service.send_verification_email",
            side_effect=lambda user, raw_token: sent_tokens.append(raw_token),
        ):
            self.register()

        first_response = self.client.post(
            "/api/auth/verify-email",
            json={"token": sent_tokens[0]},
        )
        second_response = self.client.post(
            "/api/auth/verify-email",
            json={"token": sent_tokens[0]},
        )

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 400)

    def test_resend_verification_unauthenticated_returns_401(self) -> None:
        response = self.client.post("/api/auth/resend-verification")

        self.assertEqual(response.status_code, 401)

    def test_resend_verification_creates_new_token_and_invalidates_old(self) -> None:
        sent_tokens = []

        with patch(
            "app.api.routes.auth.email_service.send_verification_email",
            side_effect=lambda user, raw_token: sent_tokens.append(raw_token),
        ):
            self.register()
            response = self.client.post("/api/auth/resend-verification")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "Verification email sent.")
        self.assertEqual(len(sent_tokens), 2)
        with Session(self.engine) as db:
            tokens = db.scalars(select(AuthToken)).all()
            first_token = get_valid_token(
                db,
                sent_tokens[0],
                "email_verification",
            )
            second_token = get_valid_token(
                db,
                sent_tokens[1],
                "email_verification",
            )

        self.assertEqual(len(tokens), 2)
        self.assertIsNone(first_token)
        self.assertIsNotNone(second_token)

    def test_resend_verification_for_verified_user_does_not_create_token(self) -> None:
        sent_tokens = []

        with patch(
            "app.api.routes.auth.email_service.send_verification_email",
            side_effect=lambda user, raw_token: sent_tokens.append(raw_token),
        ):
            self.register()
            self.client.post(
                "/api/auth/verify-email",
                json={"token": sent_tokens[0]},
            )
            response = self.client.post("/api/auth/resend-verification")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "Email already verified.")
        self.assertEqual(len(sent_tokens), 1)
        with Session(self.engine) as db:
            token_count = len(db.scalars(select(AuthToken)).all())

        self.assertEqual(token_count, 1)

    def test_me_unauthenticated_returns_401(self) -> None:
        response = self.client.get("/api/auth/me")

        self.assertEqual(response.status_code, 401)

    def test_logout_clears_cookie(self) -> None:
        self.register()

        response = self.client.post("/api/auth/logout")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "Signed out.")
        self.assertIn(
            "max-age=0",
            response.headers["set-cookie"].casefold(),
        )
        self.assertNotIn(AUTH_COOKIE_NAME, self.client.cookies)

    def test_missing_jwt_secret_returns_503_without_creating_user(self) -> None:
        settings.jwt_secret_key = ""

        response = self.register(email="not-created@example.com")

        self.assertEqual(response.status_code, 503)
        with Session(self.engine) as db:
            user = db.scalar(
                select(User).where(User.email == "not-created@example.com")
            )
        self.assertIsNone(user)

    def test_existing_routes_still_work(self) -> None:
        health_response = self.client.get("/health")
        events_response = self.client.get("/api/events")

        self.assertEqual(health_response.status_code, 200)
        self.assertEqual(events_response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
