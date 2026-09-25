from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# ─── General ──────────────────────────────────────────────────────────────────

class GeneralSettingsIn(BaseModel):
    company_name: Optional[str] = Field(None, max_length=255)
    contact_email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    address1: Optional[str] = Field(None, max_length=255)
    address2: Optional[str] = Field(None, max_length=255)
    youtube_url: Optional[str] = Field(None, max_length=500)
    instagram_url: Optional[str] = Field(None, max_length=500)
    facebook_url: Optional[str] = Field(None, max_length=500)


class GeneralSettingsOut(BaseModel):
    company_name: Optional[str] = None
    contact_email: Optional[str] = None
    phone: Optional[str] = None
    address1: Optional[str] = None
    address2: Optional[str] = None
    youtube_url: Optional[str] = None
    instagram_url: Optional[str] = None
    facebook_url: Optional[str] = None


# ─── Email / SMTP ─────────────────────────────────────────────────────────────

class EmailSettingsIn(BaseModel):
    admin_email: Optional[str] = Field(None, max_length=255)
    mail_server: Optional[str] = Field(None, max_length=255)
    mail_port: Optional[int] = Field(None, ge=1, le=65535)
    mail_login: Optional[str] = Field(None, max_length=255)
    mail_password: Optional[str] = Field(None, description="Leave absent to keep existing")


class EmailSettingsOut(BaseModel):
    admin_email: Optional[str] = None
    mail_server: Optional[str] = None
    mail_port: Optional[int] = None
    mail_login: Optional[str] = None
    mail_password_set: bool = False


# ─── Payment Gateway ──────────────────────────────────────────────────────────

class PayPalIn(BaseModel):
    enabled: Optional[bool] = None
    is_default: Optional[bool] = None
    mode: Optional[str] = Field(None, pattern="^(sandbox|live)$")
    client_id: Optional[str] = Field(None, max_length=500)
    client_secret: Optional[str] = Field(None, description="Leave absent to keep existing; empty string clears it")


class PayPalOut(BaseModel):
    enabled: bool = False
    is_default: bool = False
    mode: str = "sandbox"
    client_id: Optional[str] = None
    client_secret_set: bool = False


class StripeIn(BaseModel):
    enabled: Optional[bool] = None
    is_default: Optional[bool] = None
    mode: Optional[str] = Field(None, pattern="^(test|live)$")
    publishable_key: Optional[str] = Field(None, max_length=500)
    secret_key: Optional[str] = Field(None, description="Leave absent to keep existing; empty string clears it")
    webhook_secret: Optional[str] = Field(None, description="Leave absent to keep existing; empty string clears it")


class StripeOut(BaseModel):
    enabled: bool = False
    is_default: bool = False
    mode: str = "test"
    publishable_key: Optional[str] = None
    secret_key_set: bool = False
    webhook_secret_set: bool = False


class RazorpayIn(BaseModel):
    enabled: Optional[bool] = None
    is_default: Optional[bool] = None
    mode: Optional[str] = Field(None, pattern="^(test|live)$")
    key_id: Optional[str] = Field(None, max_length=500)
    key_secret: Optional[str] = Field(None, description="Leave absent to keep existing; empty string clears it")
    webhook_secret: Optional[str] = Field(None, description="Leave absent to keep existing; empty string clears it")


class RazorpayOut(BaseModel):
    enabled: bool = False
    is_default: bool = False
    mode: str = "test"
    key_id: Optional[str] = None
    key_secret_set: bool = False
    webhook_secret_set: bool = False


class CashfreeIn(BaseModel):
    enabled: Optional[bool] = None
    is_default: Optional[bool] = None
    mode: Optional[str] = Field(None, pattern="^(test|live)$")
    app_id: Optional[str] = Field(None, max_length=500)
    app_secret: Optional[str] = Field(None, description="Leave absent to keep existing; empty string clears it")


class CashfreeOut(BaseModel):
    enabled: bool = False
    is_default: bool = False
    mode: str = "test"
    app_id: Optional[str] = None
    app_secret_set: bool = False


class PaymentGatewaySettingsIn(BaseModel):
    default_gateway: Optional[str] = Field(None, pattern="^(paypal|stripe|razorpay|cashfree)$")
    paypal: Optional[PayPalIn] = None
    stripe: Optional[StripeIn] = None
    razorpay: Optional[RazorpayIn] = None
    cashfree: Optional[CashfreeIn] = None


class PaymentGatewaySettingsOut(BaseModel):
    default_gateway: Optional[str] = None
    paypal: PayPalOut = PayPalOut()
    stripe: StripeOut = StripeOut()
    razorpay: RazorpayOut = RazorpayOut()
    cashfree: CashfreeOut = CashfreeOut()


# ─── Top-level wrapper ────────────────────────────────────────────────────────

class SuperadminSettingsIn(BaseModel):
    """Partial-update: only the provided sections are written."""
    general: Optional[GeneralSettingsIn] = None
    email: Optional[EmailSettingsIn] = None
    payment_gateway: Optional[PaymentGatewaySettingsIn] = None


class SuperadminSettingsOut(BaseModel):
    general: GeneralSettingsOut = GeneralSettingsOut()
    email: EmailSettingsOut = EmailSettingsOut()
    payment_gateway: PaymentGatewaySettingsOut = PaymentGatewaySettingsOut()


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
