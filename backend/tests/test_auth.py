import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.security import AUTH_COOKIE_NAME, verify_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.user import User


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
        settings.jwt_secret_key = "test-secret-key-with-at-least-32-bytes"
        settings.app_env = "development"

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
        self.assertNotIn("hashed_password", response.json()["user"])
        self.assertIn(AUTH_COOKIE_NAME, response.cookies)
        self.assertIn(
            "httponly",
            response.headers["set-cookie"].casefold(),
        )

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
