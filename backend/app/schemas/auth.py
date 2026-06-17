import uuid
from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)


def normalize_email(value: str) -> str:
    return value.strip().casefold()


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=80)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email_value(cls, value: object) -> object:
        return normalize_email(value) if isinstance(value, str) else value

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email_value(cls, value: object) -> object:
        return normalize_email(value) if isinstance(value, str) else value


class EmailVerifyRequest(BaseModel):
    token: str = Field(min_length=1, max_length=512)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email_value(cls, value: object) -> object:
        return normalize_email(value) if isinstance(value, str) else value


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1, max_length=512)
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    display_name: str | None
    is_email_verified: bool
    email_verified_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    user: UserResponse
    message: str | None = None


class AuthMessageResponse(BaseModel):
    message: str


class VerifyEmailResponse(BaseModel):
    message: str
    user: UserResponse


class LogoutResponse(BaseModel):
    message: str
