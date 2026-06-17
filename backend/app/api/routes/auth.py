import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    HTTPException,
    Response,
    status,
)
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    AUTH_COOKIE_NAME,
    TokenConfigurationError,
    create_access_token,
    decode_access_token,
    require_token_configuration,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    AuthMessageResponse,
    AuthResponse,
    EmailVerifyRequest,
    LogoutResponse,
    UserCreate,
    UserLogin,
    UserResponse,
    VerifyEmailResponse,
)
from app.services import email_service
from app.services.auth_service import (
    EmailAlreadyRegisteredError,
    authenticate_user,
    get_user_by_id,
    register_user,
)
from app.services.auth_token_service import (
    consume_auth_token,
    create_auth_token,
    get_valid_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])
DatabaseSession = Annotated[Session, Depends(get_db)]
logger = logging.getLogger(__name__)
EMAIL_VERIFICATION_PURPOSE = "email_verification"


def _set_auth_cookie(response: Response, token: str) -> None:
    max_age = settings.jwt_access_token_expire_minutes * 60
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )


def _unauthorized_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
    )


def get_current_user(
    db: DatabaseSession,
    access_token: Annotated[
        str | None,
        Cookie(alias=AUTH_COOKIE_NAME),
    ] = None,
) -> User:
    if not access_token:
        raise _unauthorized_exception()

    user_id = decode_access_token(access_token)
    if user_id is None:
        raise _unauthorized_exception()

    user = get_user_by_id(db, user_id)
    if user is None:
        raise _unauthorized_exception()

    return user


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    payload: UserCreate,
    response: Response,
    db: DatabaseSession,
) -> AuthResponse:
    try:
        require_token_configuration()
        user = register_user(db, payload)
        raw_verification_token = create_auth_token(
            db,
            user,
            EMAIL_VERIFICATION_PURPOSE,
            timedelta(minutes=settings.email_verification_token_expire_minutes),
        )
        db.commit()
        db.refresh(user)
        token = create_access_token(user.id)
    except EmailAlreadyRegisteredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists for this email.",
        ) from exc
    except TokenConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    try:
        email_service.send_verification_email(user, raw_verification_token)
    except Exception:
        logger.exception("Failed to send verification email for user %s", user.id)

    _set_auth_cookie(response, token)
    return AuthResponse(
        user=UserResponse.model_validate(user),
        message="Account created. Please verify your email.",
    )


@router.post("/login", response_model=AuthResponse)
def login(
    payload: UserLogin,
    response: Response,
    db: DatabaseSession,
) -> AuthResponse:
    try:
        require_token_configuration()
    except TokenConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    user = authenticate_user(db, str(payload.email), payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    try:
        token = create_access_token(user.id)
    except TokenConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    _set_auth_cookie(response, token)
    return AuthResponse(
        user=UserResponse.model_validate(user),
        message="Signed in.",
    )


@router.get("/me", response_model=UserResponse)
def me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.post("/verify-email", response_model=VerifyEmailResponse)
def verify_email(
    payload: EmailVerifyRequest,
    db: DatabaseSession,
) -> VerifyEmailResponse:
    auth_token = get_valid_token(
        db,
        payload.token,
        EMAIL_VERIFICATION_PURPOSE,
    )
    if auth_token is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token.",
        )

    user = auth_token.user
    user.is_email_verified = True
    user.email_verified_at = datetime.now(UTC)
    consume_auth_token(db, auth_token)
    db.commit()
    db.refresh(user)

    return VerifyEmailResponse(
        message="Email verified.",
        user=UserResponse.model_validate(user),
    )


@router.post("/resend-verification", response_model=AuthMessageResponse)
def resend_verification(
    current_user: Annotated[User, Depends(get_current_user)],
    db: DatabaseSession,
) -> AuthMessageResponse:
    if current_user.is_email_verified:
        return AuthMessageResponse(message="Email already verified.")

    raw_verification_token = create_auth_token(
        db,
        current_user,
        EMAIL_VERIFICATION_PURPOSE,
        timedelta(minutes=settings.email_verification_token_expire_minutes),
    )
    db.commit()
    db.refresh(current_user)

    try:
        email_service.send_verification_email(
            current_user,
            raw_verification_token,
        )
    except Exception:
        logger.exception(
            "Failed to resend verification email for user %s",
            current_user.id,
        )

    return AuthMessageResponse(message="Verification email sent.")


@router.post("/logout", response_model=LogoutResponse)
def logout(response: Response) -> LogoutResponse:
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
    )
    return LogoutResponse(message="Signed out.")
