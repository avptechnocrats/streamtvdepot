from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


# ─── General Settings ─────────────────────────────────────────────────────────

class GeneralSettingsIn(BaseModel):
    site_title: Optional[str] = Field(None, max_length=255)
    site_url: Optional[str] = Field(None, max_length=500)
    tagline: Optional[str] = Field(None, max_length=500)
    site_language: Optional[str] = Field(None, max_length=50)
    copyright_text: Optional[str] = Field(None, max_length=500)
    logo_s3_key: Optional[str] = Field(None, description="S3 key of the uploaded logo")
    clear_logo: bool = Field(False, description="Set to true to remove the current logo")
    favicon_s3_key: Optional[str] = Field(None, description="S3 key of the uploaded favicon")
    clear_favicon: bool = Field(False, description="Set to true to remove the current favicon")
    address1: Optional[str] = Field(None, max_length=255)
    address2: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    contact_email: Optional[str] = Field(None, max_length=255)
    youtube_url: Optional[str] = Field(None, max_length=500)
    instagram_url: Optional[str] = Field(None, max_length=500)
    facebook_url: Optional[str] = Field(None, max_length=500)

    @field_validator("site_url")
    @classmethod
    def validate_site_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        site_url = value.strip().rstrip("/")
        if not site_url:
            return None
        if not site_url.startswith(("https://", "http://")):
            raise ValueError("Site URL must start with http:// or https://")
        if "." not in site_url.split("://", 1)[1].split("/", 1)[0] and "localhost" not in site_url:
            raise ValueError("Site URL must include a valid host name")
        return site_url


class GeneralSettingsOut(BaseModel):
    site_title: Optional[str] = None
    site_url: Optional[str] = None
    tagline: Optional[str] = None
    site_language: Optional[str] = None
    copyright_text: Optional[str] = None
    logo_s3_key: Optional[str] = None
    logo_url: Optional[str] = None  # Presigned GET URL, generated on read
    favicon_s3_key: Optional[str] = None
    favicon_url: Optional[str] = None  # Presigned GET URL, generated on read
    address1: Optional[str] = None
    address2: Optional[str] = None
    phone: Optional[str] = None
    contact_email: Optional[str] = None
    youtube_url: Optional[str] = None
    instagram_url: Optional[str] = None
    facebook_url: Optional[str] = None


# ─── Email / SMTP Settings ───────────────────────────────────────────────────

class EmailSettingsIn(BaseModel):
    admin_email: Optional[str] = Field(None, max_length=255)
    mail_server: Optional[str] = Field(None, max_length=255)
    mail_port: Optional[int] = Field(None, ge=1, le=65535)
    mail_login: Optional[str] = Field(None, max_length=255)
    # Password is stored in site_config JSONB; treat as write-only from the API
    mail_password: Optional[str] = Field(None, max_length=500)


class EmailSettingsOut(BaseModel):
    admin_email: Optional[str] = None
    mail_server: Optional[str] = None
    mail_port: Optional[int] = None
    mail_login: Optional[str] = None
    # Password is returned masked; the client only needs to know whether it is set
    mail_password_set: bool = False


# ─── Social Auth Settings (Google OAuth2) ────────────────────────────────────

class GoogleOAuthSettingsIn(BaseModel):
    """Google OAuth2 configuration for social login."""
    enabled: bool = Field(False, description="Enable/disable Google sign-in")
    client_id: Optional[str] = Field(None, max_length=500, description="Google OAuth2 Client ID")
    # Secret is stored encrypted; treat as write-only from the API
    client_secret: Optional[str] = Field(None, max_length=500, description="Google OAuth2 Client Secret")
    redirect_uri: Optional[str] = Field(None, max_length=500, description="OAuth2 redirect URI (e.g. https://yourdomain.com/auth/callback)")


class GoogleOAuthSettingsOut(BaseModel):
    """Google OAuth2 settings output (secret masked)."""
    enabled: bool = False
    client_id: Optional[str] = None
    client_secret_set: bool = False  # Only indicate if secret is configured
    redirect_uri: Optional[str] = None


class SocialAuthSettingsIn(BaseModel):
    """All social auth provider configurations."""
    google: Optional[GoogleOAuthSettingsIn] = None


class PublicSocialAuthProviderOut(BaseModel):
    """Non-sensitive OAuth provider configuration for a storefront."""
    enabled: bool = False
    client_id: Optional[str] = None
    redirect_uri: Optional[str] = None


class PublicSocialAuthConfigOut(BaseModel):
    """Social sign-in providers available for a storefront."""
    google: PublicSocialAuthProviderOut


class SocialAuthSettingsOut(BaseModel):
    """All social auth provider configurations (read-only)."""
    google: GoogleOAuthSettingsOut


# ─── Combined Site Settings ───────────────────────────────────────────────────

class SiteSettingsIn(BaseModel):
    general: Optional[GeneralSettingsIn] = None
    email: Optional[EmailSettingsIn] = None
    social_auth: Optional[SocialAuthSettingsIn] = None
    onboarding_completed: Optional[bool] = None


class SiteSettingsOut(BaseModel):
    general: GeneralSettingsOut
    email: EmailSettingsOut
    social_auth: SocialAuthSettingsOut
    client_name: Optional[str] = None
    onboarding_completed: bool = True


# ─── SMTP Test ────────────────────────────────────────────────────────────────

class SmtpTestRequest(BaseModel):
    to_email: EmailStr
    message: str = Field(..., min_length=1, max_length=5000)
    subject: str = Field(..., min_length=1, max_length=255)
    mail_server: Optional[str] = Field(None, max_length=255)
    mail_port: Optional[int] = Field(None, ge=1, le=65535)
    mail_login: Optional[str] = Field(None, max_length=255)
    mail_password: Optional[str] = Field(None, max_length=500)


class SmtpTestResponse(BaseModel):
    success: bool = True
    message: str = "Test email sent successfully."
    debug: dict = Field(default_factory=dict)


# ─── Logo Upload ──────────────────────────────────────────────────────────────

class LogoPresignRequest(BaseModel):
    filename: str
    content_type: str
    file_size: int = Field(..., gt=0, le=10 * 1024 * 1024, description="Max 10 MB")
    asset_type: str = Field("logo", pattern="^(logo|favicon)$")


class LogoPresignResponse(BaseModel):
    upload_url: str
    s3_key: str
