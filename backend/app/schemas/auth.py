from pydantic import BaseModel, EmailStr, field_validator, model_validator


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str | None = None  # "superadmin" | "client_admin" — set by unified /auth/login
    requires_subscription: bool = False


class RefreshRequest(BaseModel):
    refresh_token: str


# ─── Signup ───────────────────────────────────────────────────────────────────

class SaasRegisterRequest(BaseModel):
    """Public self-service registration: creates a new Client + OWNER admin in one step."""
    platform_name: str
    """Human-readable name for the platform, e.g. 'Kalingo TV'."""
    platform_slug: str
    """URL-safe unique identifier, e.g. 'kalingo-tv'. Used as tenant key."""
    domain: str | None = None
    """Optional custom domain for the storefront, e.g. 'kalingo.tv'."""
    email: EmailStr
    full_name: str
    password: str
    phone: str | None = None
    country: str | None = None
    timezone: str = "UTC"

    @field_validator("platform_slug")
    @classmethod
    def slug_format(cls, v: str) -> str:
        import re
        if not re.match(r"^[a-z0-9][a-z0-9\-]{1,98}[a-z0-9]$", v):
            raise ValueError("Slug must be lowercase letters, numbers and hyphens only (3-100 chars)")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class SaasRegisterResponse(BaseModel):
    client_id: str
    client_slug: str
    verification_email_sent: bool = False
    message: str


class VerifyEmailResponse(BaseModel):
    verified: bool
    message: str
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    role: str | None = None
    email: EmailStr | None = None
    full_name: str | None = None


class VerifyEmailRequest(BaseModel):
    client_slug: str
    email: EmailStr
    otp: str

    @field_validator("otp")
    @classmethod
    def otp_format(cls, value: str) -> str:
        if not value.isdigit() or len(value) != 6:
            raise ValueError("Invalid OTP. Please try again.")
        return value


class ResendVerificationRequest(BaseModel):
    client_slug: str
    email: EmailStr


class ResendVerificationResponse(BaseModel):
    message: str


class UserSignupResponse(BaseModel):
    """Tokens are omitted when the account must be verified before sign-in."""
    verification_required: bool = False
    verification_email_sent: bool = False
    email: EmailStr | None = None
    message: str
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"


class AdminSignupRequest(BaseModel):
    """Self-registration for a client admin. Requires the client slug."""
    client_slug: str
    email: EmailStr
    password: str
    full_name: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserSignupRequest(BaseModel):
    """Self-registration for an end user. Scoped to a client via slug."""
    client_slug: str
    email: EmailStr
    password: str
    full_name: str
    phone: str | None = None
    country: str | None = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserLoginRequest(BaseModel):
    """Login scoped to a specific client tenant."""
    client_slug: str
    email: EmailStr | None = None
    phone: str | None = None
    password: str

    @model_validator(mode="after")
    def require_login_identifier(self) -> "UserLoginRequest":
        if bool(self.email) == bool(self.phone):
            raise ValueError("Provide either email or phone.")

        if self.phone:
            self.phone = self.phone.strip()

        return self


# ─── Password management ──────────────────────────────────────────────────────

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    """For client-scoped users (admin/end-user) also supply client_slug."""
    client_slug: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class ForgotPasswordResponse(BaseModel):
    message: str
    """
    reset_token is returned directly here for development convenience.
    In production, this field should be omitted and the token delivered via email.
    """
    reset_token: str
