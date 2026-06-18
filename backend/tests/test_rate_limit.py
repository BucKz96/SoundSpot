import sys
import unittest
from pathlib import Path
from time import monotonic
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.rate_limit import (
    RATE_LIMIT_MESSAGE,
    RateLimitRule,
    clear_rate_limit_store,
    get_client_ip,
    require_rate_limit,
    set_rate_limit_clock,
)
from app.db.base import Base
from app.db.session import get_db
from app.main import app


def make_request(
    path: str = "/limited",
    client_host: str = "198.51.100.7",
    headers: list[tuple[bytes, bytes]] | None = None,
) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "headers": headers or [],
            "client": (client_host, 12345),
        }
    )


class RateLimitRouteTests(unittest.TestCase):
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

        self.original_rate_limit_enabled = settings.rate_limit_enabled
        self.original_jwt_secret_key = settings.jwt_secret_key
        settings.rate_limit_enabled = True
        settings.jwt_secret_key = "test-secret-key-with-at-least-32-bytes"

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
        settings.rate_limit_enabled = self.original_rate_limit_enabled
        settings.jwt_secret_key = self.original_jwt_secret_key
        set_rate_limit_clock(monotonic)
        clear_rate_limit_store()

    def test_login_is_limited_by_ip(self) -> None:
        for _ in range(10):
            response = self.client.post(
                "/api/auth/login",
                json={"email": "missing@example.com", "password": "password123"},
            )
            self.assertEqual(response.status_code, 401)

        response = self.client.post(
            "/api/auth/login",
            json={"email": "missing@example.com", "password": "password123"},
        )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["detail"], RATE_LIMIT_MESSAGE)

    def test_forgot_password_limit_keeps_generic_success_until_limited(self) -> None:
        for _ in range(3):
            response = self.client.post(
                "/api/auth/forgot-password",
                json={"email": "unknown@example.com"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                response.json()["message"],
                "If an account exists, a reset email has been sent.",
            )

        response = self.client.post(
            "/api/auth/forgot-password",
            json={"email": "unknown@example.com"},
        )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["detail"], RATE_LIMIT_MESSAGE)

    def test_discovery_is_limited_by_ip(self) -> None:
        with patch(
            "app.api.routes.events.get_discovery_events",
            new=AsyncMock(return_value=[]),
        ):
            for _ in range(30):
                response = self.client.get("/api/events/discovery")
                self.assertEqual(response.status_code, 200)

            response = self.client.get("/api/events/discovery")

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["detail"], RATE_LIMIT_MESSAGE)

    def test_rate_limit_can_be_disabled(self) -> None:
        settings.rate_limit_enabled = False

        with patch(
            "app.api.routes.events.get_discovery_events",
            new=AsyncMock(return_value=[]),
        ):
            responses = [
                self.client.get("/api/events/discovery")
                for _ in range(35)
            ]

        self.assertTrue(all(response.status_code == 200 for response in responses))

    def test_expired_window_allows_retry(self) -> None:
        current_time = [1000.0]
        set_rate_limit_clock(lambda: current_time[0])
        request = make_request()
        rule = RateLimitRule("test:short-window", 2, 10)

        require_rate_limit(request, rule)
        require_rate_limit(request, rule)
        with self.assertRaises(Exception) as raised:
            require_rate_limit(request, rule)

        self.assertEqual(raised.exception.status_code, 429)
        current_time[0] += 11
        require_rate_limit(request, rule)

    def test_x_forwarded_for_first_ip_is_used(self) -> None:
        request = make_request(
            headers=[
                (b"x-forwarded-for", b"203.0.113.9, 198.51.100.10"),
            ]
        )

        self.assertEqual(get_client_ip(request), "203.0.113.9")


if __name__ == "__main__":
    unittest.main()
