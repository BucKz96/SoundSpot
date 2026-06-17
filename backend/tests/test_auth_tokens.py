import sys
import unittest
from datetime import timedelta
from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.security import hash_password
from app.db.base import Base
from app.models.auth_token import AuthToken
from app.models.user import User
from app.services.auth_token_service import (
    consume_auth_token,
    create_auth_token,
    generate_raw_token,
    get_valid_token,
    hash_token,
)


class AuthTokenServiceTests(unittest.TestCase):
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

    def create_user(self, db: Session, email: str = "token@example.com") -> User:
        user = User(
            email=email,
            hashed_password=hash_password("password123"),
            display_name="Token User",
        )
        db.add(user)
        db.flush()
        return user

    def test_generate_raw_token_returns_unique_tokens(self) -> None:
        first_token = generate_raw_token()
        second_token = generate_raw_token()

        self.assertIsInstance(first_token, str)
        self.assertIsInstance(second_token, str)
        self.assertNotEqual(first_token, second_token)
        self.assertGreaterEqual(len(first_token), 40)

    def test_hash_token_does_not_return_raw_token(self) -> None:
        raw_token = "raw-token-value"
        token_hash = hash_token(raw_token)

        self.assertNotEqual(token_hash, raw_token)
        self.assertEqual(len(token_hash), 64)

    def test_create_auth_token_stores_only_token_hash(self) -> None:
        with self.TestSessionLocal() as db:
            user = self.create_user(db)

            raw_token = create_auth_token(
                db,
                user,
                "email_verification",
                timedelta(minutes=30),
            )
            stored_token = db.scalar(select(AuthToken))

            self.assertIsNotNone(stored_token)
            self.assertNotEqual(stored_token.token_hash, raw_token)
            self.assertEqual(stored_token.token_hash, hash_token(raw_token))

    def test_get_valid_token_returns_valid_token(self) -> None:
        with self.TestSessionLocal() as db:
            user = self.create_user(db)
            raw_token = create_auth_token(
                db,
                user,
                "email_verification",
                timedelta(minutes=30),
            )

            valid_token = get_valid_token(db, raw_token, "email_verification")

            self.assertIsNotNone(valid_token)
            self.assertEqual(valid_token.user_id, user.id)

    def test_get_valid_token_refuses_invalid_token(self) -> None:
        with self.TestSessionLocal() as db:
            user = self.create_user(db)
            create_auth_token(
                db,
                user,
                "email_verification",
                timedelta(minutes=30),
            )

            valid_token = get_valid_token(
                db,
                "invalid-token",
                "email_verification",
            )

            self.assertIsNone(valid_token)

    def test_get_valid_token_refuses_wrong_purpose(self) -> None:
        with self.TestSessionLocal() as db:
            user = self.create_user(db)
            raw_token = create_auth_token(
                db,
                user,
                "email_verification",
                timedelta(minutes=30),
            )

            valid_token = get_valid_token(db, raw_token, "password_reset")

            self.assertIsNone(valid_token)

    def test_get_valid_token_refuses_expired_token(self) -> None:
        with self.TestSessionLocal() as db:
            user = self.create_user(db)
            raw_token = create_auth_token(
                db,
                user,
                "password_reset",
                timedelta(minutes=-1),
            )

            valid_token = get_valid_token(db, raw_token, "password_reset")

            self.assertIsNone(valid_token)

    def test_consume_auth_token_prevents_reuse(self) -> None:
        with self.TestSessionLocal() as db:
            user = self.create_user(db)
            raw_token = create_auth_token(
                db,
                user,
                "password_reset",
                timedelta(minutes=30),
            )
            auth_token = get_valid_token(db, raw_token, "password_reset")

            consume_auth_token(db, auth_token)
            reused_token = get_valid_token(db, raw_token, "password_reset")

            self.assertIsNone(reused_token)

    def test_create_auth_token_invalidates_previous_unused_tokens(self) -> None:
        with self.TestSessionLocal() as db:
            user = self.create_user(db)
            first_raw_token = create_auth_token(
                db,
                user,
                "email_verification",
                timedelta(minutes=30),
            )
            second_raw_token = create_auth_token(
                db,
                user,
                "email_verification",
                timedelta(minutes=30),
            )

            first_token = get_valid_token(
                db,
                first_raw_token,
                "email_verification",
            )
            second_token = get_valid_token(
                db,
                second_raw_token,
                "email_verification",
            )

            self.assertIsNone(first_token)
            self.assertIsNotNone(second_token)

    def test_user_email_verified_defaults_to_false(self) -> None:
        with self.TestSessionLocal() as db:
            user = self.create_user(db)

            self.assertFalse(user.is_email_verified)
            self.assertIsNone(user.email_verified_at)


if __name__ == "__main__":
    unittest.main()
