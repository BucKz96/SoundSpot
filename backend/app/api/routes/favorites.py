import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.favorite import (
    EventFavoriteCreate,
    EventFavoriteResponse,
    FavoriteDeleteResponse,
)
from app.services.favorites_service import (
    FavoriteAlreadyExistsError,
    FavoriteDatabaseError,
    FavoriteNotFoundError,
    create_event_favorite,
    delete_event_favorite,
    list_event_favorites,
)

router = APIRouter(prefix="/favorites/events", tags=["favorites"])
DatabaseSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _database_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unable to complete the favorite operation.",
    )


@router.get("", response_model=list[EventFavoriteResponse])
def list_favorites(
    db: DatabaseSession,
    current_user: CurrentUser,
) -> list[EventFavoriteResponse]:
    try:
        favorites = list_event_favorites(db, current_user)
    except FavoriteDatabaseError as exc:
        raise _database_error() from exc
    return [
        EventFavoriteResponse.model_validate(favorite)
        for favorite in favorites
    ]


@router.post(
    "",
    response_model=EventFavoriteResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_favorite(
    payload: EventFavoriteCreate,
    db: DatabaseSession,
    current_user: CurrentUser,
) -> EventFavoriteResponse:
    try:
        favorite = create_event_favorite(db, current_user, payload)
    except FavoriteAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This event is already in your favorites.",
        ) from exc
    except FavoriteDatabaseError as exc:
        raise _database_error() from exc
    return EventFavoriteResponse.model_validate(favorite)


@router.delete("/{favorite_id}", response_model=FavoriteDeleteResponse)
def delete_favorite(
    favorite_id: uuid.UUID,
    db: DatabaseSession,
    current_user: CurrentUser,
) -> FavoriteDeleteResponse:
    try:
        delete_event_favorite(db, current_user, favorite_id)
    except FavoriteNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Favorite not found.",
        ) from exc
    except FavoriteDatabaseError as exc:
        raise _database_error() from exc
    return FavoriteDeleteResponse(message="Favorite deleted.")
