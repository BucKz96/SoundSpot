import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.auth import UserCreate, normalize_email


class EmailAlreadyRegisteredError(Exception):
    """Raised when a user already exists for an email address."""


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(
        select(User).where(User.email == normalize_email(email))
    )


def get_user_by_id(db: Session, user_id: uuid.UUID) -> User | None:
    return db.get(User, user_id)


def register_user(db: Session, user_data: UserCreate) -> User:
    if get_user_by_email(db, str(user_data.email)) is not None:
        raise EmailAlreadyRegisteredError

    user = User(
        email=normalize_email(str(user_data.email)),
        hashed_password=hash_password(user_data.password),
        display_name=user_data.display_name,
    )
    db.add(user)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise EmailAlreadyRegisteredError from exc

    db.refresh(user)
    return user


def authenticate_user(
    db: Session,
    email: str,
    password: str,
) -> User | None:
    user = get_user_by_email(db, email)
    if user is None or not verify_password(password, user.hashed_password):
        return None
    return user
