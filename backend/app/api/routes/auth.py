import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import (
    AUTH_FORGOT_PASSWORD_EMAIL,
    AUTH_FORGOT_PASSWORD_IP,
    AUTH_LOGIN_EMAIL,
    AUTH_LOGIN_IP,
    AUTH_REGISTER_IP,
    AUTH_RESEND_VERIFICATION_IP,
    AUTH_RESEND_VERIFICATION_USER,
    AUTH_RESET_PASSWORD_IP,
    AUTH_VERIFY_EMAIL_IP,
    require_rate_limit,
)
from app.core.security import (
    AUTH_COOKIE_NAME,
    TokenConfigurationError,
    create_access_token,
    decode_access_token,
    hash_password,
    require_token_configuration,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    AuthMessageResponse,
    AuthResponse,
    EmailVerifyRequest,
    ForgotPasswordRequest,
    LogoutResponse,
    ResetPasswordRequest,
    UserCreate,
    UserLogin,
    UserResponse,
    VerifyEmailResponse,
)
from app.services import email_service
from app.services.auth_service import (
    EmailAlreadyRegisteredError,
    authenticate_user,
    get_user_by_email,
    get_user_by_id,
    register_user,
)
from app.services.auth_token_service import (
    consume_auth_token,
    create_auth_token,
    get_valid_token,
    invalidate_user_tokens,
)

router = APIRouter(prefix="/auth", tags=["auth"])
DatabaseSession = Annotated[Session, Depends(get_db)]
logger = logging.getLogger(__name__)
EMAIL_VERIFICATION_PURPOSE = "email_verification"
PASSWORD_RESET_PURPOSE = "password_reset"
PASSWORD_RESET_REQUEST_MESSAGE = "If an account exists, a reset email has been sent."


def _set_auth_cookie(response: Response, token: str) -> None:
    max_age = settings.jwt_access_token_expire_minutes * 60
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.resolved_auth_cookie_samesite,
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
    request: Request,
    response: Response,
    db: DatabaseSession,
) -> AuthResponse:
    require_rate_limit(request, AUTH_REGISTER_IP)

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
    request: Request,
    response: Response,
    db: DatabaseSession,
) -> AuthResponse:
    require_rate_limit(request, AUTH_LOGIN_IP)
    require_rate_limit(request, AUTH_LOGIN_EMAIL, payload.email)

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
    request: Request,
    db: DatabaseSession,
) -> VerifyEmailResponse:
    require_rate_limit(request, AUTH_VERIFY_EMAIL_IP)

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
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: DatabaseSession,
) -> AuthMessageResponse:
    require_rate_limit(request, AUTH_RESEND_VERIFICATION_IP)
    require_rate_limit(request, AUTH_RESEND_VERIFICATION_USER, current_user.email)

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


@router.post("/forgot-password", response_model=AuthMessageResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: DatabaseSession,
) -> AuthMessageResponse:
    require_rate_limit(request, AUTH_FORGOT_PASSWORD_IP)
    require_rate_limit(request, AUTH_FORGOT_PASSWORD_EMAIL, payload.email)

    user = get_user_by_email(db, str(payload.email))
    if user is None:
        return AuthMessageResponse(message=PASSWORD_RESET_REQUEST_MESSAGE)

    raw_reset_token = create_auth_token(
        db,
        user,
        PASSWORD_RESET_PURPOSE,
        timedelta(minutes=settings.password_reset_token_expire_minutes),
    )
    db.commit()
    db.refresh(user)

    try:
        email_service.send_password_reset_email(user, raw_reset_token)
    except Exception:
        logger.exception("Failed to send password reset email for user %s", user.id)

    return AuthMessageResponse(message=PASSWORD_RESET_REQUEST_MESSAGE)


@router.post("/reset-password", response_model=AuthMessageResponse)
def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    db: DatabaseSession,
) -> AuthMessageResponse:
    require_rate_limit(request, AUTH_RESET_PASSWORD_IP)

    auth_token = get_valid_token(
        db,
        payload.token,
        PASSWORD_RESET_PURPOSE,
    )
    if auth_token is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token.",
        )

    user = auth_token.user
    user.hashed_password = hash_password(payload.password)
    consume_auth_token(db, auth_token)
    invalidate_user_tokens(db, user, PASSWORD_RESET_PURPOSE)
    db.commit()

    return AuthMessageResponse(message="Password updated.")


@router.post("/logout", response_model=LogoutResponse)
def logout(response: Response) -> LogoutResponse:
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.resolved_auth_cookie_samesite,
    )
    return LogoutResponse(message="Signed out.")
