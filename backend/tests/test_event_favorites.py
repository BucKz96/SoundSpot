import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.rate_limit import clear_rate_limit_store
from app.db.base import Base
from app.db.session import get_db
from app.main import app


class EventFavoriteRouteTests(unittest.TestCase):
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
        clear_rate_limit_store()
        self.client.close()
        app.dependency_overrides.clear()
        settings.jwt_secret_key = self.original_secret
        settings.app_env = self.original_app_env

    def register(
        self,
        email: str = "favorite@example.com",
        display_name: str = "Favorite User",
    ):
        return self.client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": "password123",
                "display_name": display_name,
            },
        )

    def login(self, email: str):
        return self.client.post(
            "/api/auth/login",
            json={"email": email, "password": "password123"},
        )

    @staticmethod
    def favorite_payload(
        event_id: str = "event-123",
        source: str = "shotgun",
    ) -> dict[str, str]:
        return {
            "event_id": event_id,
            "source": source,
            "event_name": "Test Event",
            "artist": "Test Artist",
            "city": "Paris",
            "country": "France",
            "venue": "Test Venue",
            "date": "2026-06-12",
            "time": "20:00",
            "ticket_url": "https://example.com/tickets",
            "image_url": "https://example.com/image.jpg",
        }

    def test_get_favorites_unauthenticated_returns_401(self) -> None:
        response = self.client.get("/api/favorites/events")

        self.assertEqual(response.status_code, 401)

    def test_post_favorite_unauthenticated_returns_401(self) -> None:
        response = self.client.post(
            "/api/favorites/events",
            json=self.favorite_payload(),
        )

        self.assertEqual(response.status_code, 401)

    def test_delete_favorite_unauthenticated_returns_401(self) -> None:
        response = self.client.delete(
            "/api/favorites/events/00000000-0000-0000-0000-000000000001"
        )

        self.assertEqual(response.status_code, 401)

    def test_register_login_then_create_favorite_success(self) -> None:
        self.assertEqual(self.register().status_code, 201)
        self.client.cookies.clear()
        self.assertEqual(self.login("favorite@example.com").status_code, 200)

        response = self.client.post(
            "/api/favorites/events",
            json=self.favorite_payload(),
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["event_id"], "event-123")
        self.assertEqual(body["source"], "shotgun")
        self.assertEqual(body["date"], "2026-06-12")
        self.assertEqual(body["time"], "20:00:00")
        self.assertNotIn("user_id", body)

    def test_get_favorites_returns_created_favorite(self) -> None:
        self.register()
        created = self.client.post(
            "/api/favorites/events",
            json=self.favorite_payload(),
        )

        response = self.client.get("/api/favorites/events")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["id"], created.json()["id"])

    def test_duplicate_for_same_user_source_and_event_returns_409(self) -> None:
        self.register()
        payload = self.favorite_payload()
        self.assertEqual(
            self.client.post(
                "/api/favorites/events",
                json=payload,
            ).status_code,
            201,
        )

        response = self.client.post(
            "/api/favorites/events",
            json=payload,
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"],
            "This event is already in your favorites.",
        )

    def test_two_users_can_favorite_same_source_and_event(self) -> None:
        self.register(email="first@example.com")
        first_response = self.client.post(
            "/api/favorites/events",
            json=self.favorite_payload(),
        )
        self.client.cookies.clear()
        self.register(email="second@example.com")

        second_response = self.client.post(
            "/api/favorites/events",
            json=self.favorite_payload(),
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 201)
        self.assertNotEqual(
            first_response.json()["id"],
            second_response.json()["id"],
        )

    def test_user_cannot_delete_another_users_favorite(self) -> None:
        self.register(email="owner@example.com")
        favorite = self.client.post(
            "/api/favorites/events",
            json=self.favorite_payload(),
        ).json()
        self.client.cookies.clear()
        self.register(email="other@example.com")

        response = self.client.delete(
            f"/api/favorites/events/{favorite['id']}"
        )

        self.assertEqual(response.status_code, 404)

    def test_delete_own_favorite_success_then_list_is_empty(self) -> None:
        self.register()
        favorite = self.client.post(
            "/api/favorites/events",
            json=self.favorite_payload(),
        ).json()

        delete_response = self.client.delete(
            f"/api/favorites/events/{favorite['id']}"
        )
        list_response = self.client.get("/api/favorites/events")

        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(
            delete_response.json()["message"],
            "Favorite deleted.",
        )
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.json(), [])


if __name__ == "__main__":
    unittest.main()
