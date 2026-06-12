import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import UniqueConstraint

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.db.base import Base
from app.main import app
from app.models import EventFavorite, User


class DatabaseFoundationTests(unittest.TestCase):
    def test_models_are_registered_in_metadata(self) -> None:
        self.assertIn("users", Base.metadata.tables)
        self.assertIn("event_favorites", Base.metadata.tables)
        self.assertEqual(User.__tablename__, "users")
        self.assertEqual(EventFavorite.__tablename__, "event_favorites")

    def test_event_favorite_has_expected_unique_constraint(self) -> None:
        table = Base.metadata.tables["event_favorites"]
        unique_constraints = {
            constraint.name: tuple(column.name for column in constraint.columns)
            for constraint in table.constraints
            if isinstance(constraint, UniqueConstraint)
        }

        self.assertEqual(
            unique_constraints["uq_event_favorites_user_source_event"],
            ("user_id", "source", "event_id"),
        )

    def test_event_favorite_user_foreign_key_cascades(self) -> None:
        table = Base.metadata.tables["event_favorites"]
        user_id_foreign_key = next(iter(table.c.user_id.foreign_keys))

        self.assertEqual(user_id_foreign_key.target_fullname, "users.id")
        self.assertEqual(user_id_foreign_key.ondelete, "CASCADE")

    def test_settings_accept_database_url(self) -> None:
        database_url = "postgresql+psycopg://user:pass@db:5432/test_db"

        configured_settings = Settings(
            _env_file=None,
            database_url=database_url,
        )

        self.assertEqual(configured_settings.database_url, database_url)

    def test_app_and_existing_events_endpoint_still_work(self) -> None:
        client = TestClient(app)

        health_response = client.get("/health")
        events_response = client.get("/api/events")

        self.assertEqual(health_response.status_code, 200)
        self.assertEqual(events_response.status_code, 200)
        self.assertIsInstance(events_response.json(), list)


if __name__ == "__main__":
    unittest.main()
