import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.event_favorite import EventFavorite
from app.models.user import User
from app.schemas.favorite import EventFavoriteCreate


class FavoriteAlreadyExistsError(Exception):
    """Raised when an event is already favorited by the current user."""


class FavoriteNotFoundError(Exception):
    """Raised when a favorite is unavailable to the current user."""


class FavoriteDatabaseError(Exception):
    """Raised when a favorite operation fails unexpectedly."""


def list_event_favorites(db: Session, user: User) -> list[EventFavorite]:
    try:
        return list(
            db.scalars(
                select(EventFavorite)
                .where(EventFavorite.user_id == user.id)
                .order_by(EventFavorite.created_at.desc())
            )
        )
    except SQLAlchemyError as exc:
        db.rollback()
        raise FavoriteDatabaseError from exc


def create_event_favorite(
    db: Session,
    user: User,
    payload: EventFavoriteCreate,
) -> EventFavorite:
    favorite = EventFavorite(
        user_id=user.id,
        event_id=payload.event_id,
        source=payload.source,
        event_name=payload.event_name,
        artist=payload.artist,
        city=payload.city,
        country=payload.country,
        venue=payload.venue,
        event_date=payload.date,
        event_time=payload.time,
        ticket_url=str(payload.ticket_url) if payload.ticket_url else None,
        image_url=str(payload.image_url) if payload.image_url else None,
    )
    db.add(favorite)

    try:
        db.commit()
        db.refresh(favorite)
    except IntegrityError as exc:
        db.rollback()
        raise FavoriteAlreadyExistsError from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise FavoriteDatabaseError from exc

    return favorite


def delete_event_favorite(
    db: Session,
    user: User,
    favorite_id: uuid.UUID,
) -> None:
    try:
        favorite = db.scalar(
            select(EventFavorite).where(
                EventFavorite.id == favorite_id,
                EventFavorite.user_id == user.id,
            )
        )
        if favorite is None:
            raise FavoriteNotFoundError

        db.delete(favorite)
        db.commit()
    except FavoriteNotFoundError:
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise FavoriteDatabaseError from exc
