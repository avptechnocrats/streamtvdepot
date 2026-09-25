"""
Pydantic schemas for admin payment gateway configuration.

Security design:
  - Public/publishable keys are stored and returned as plaintext (they are
    intentionally client-safe values exposed in browser JS by Stripe/PayPal).
  - Secret keys and webhook secrets are **encrypted at rest** using Fernet
    (DRM_FERNET_KEY).  They are NEVER returned in API responses – only the
    boolean ``*_set`` flags indicate whether a value has been configured.
"""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ─── PayPal ───────────────────────────────────────────────────────────────────

class PayPalSettingsIn(BaseModel):
    enabled: Optional[bool] = None
    mode: Optional[Literal["sandbox", "live"]] = None
    is_default: Optional[bool] = None
    client_id: Optional[str] = Field(None, max_length=500)
    # Write-only.  Send null / empty string to clear an existing value.
    client_secret: Optional[str] = Field(None, max_length=500)
    sandbox: Optional[dict[str, Any]] = None
    live: Optional[dict[str, Any]] = None


class PayPalSettingsOut(BaseModel):
    enabled: bool = False
    mode: Literal["sandbox", "live"] = "sandbox"
    is_default: bool = False
    client_id: Optional[str] = None
    client_secret_set: bool = False
    sandbox: dict[str, Any] = {}
    live: dict[str, Any] = {}


# ─── Stripe ───────────────────────────────────────────────────────────────────

class StripeSettingsIn(BaseModel):
    enabled: Optional[bool] = None
    mode: Optional[Literal["test", "live"]] = None
    is_default: Optional[bool] = None
    publishable_key: Optional[str] = Field(None, max_length=500)
    # Write-only secret fields.  Send null / empty string to clear.
    secret_key: Optional[str] = Field(None, max_length=500)
    webhook_secret: Optional[str] = Field(None, max_length=500)
    test: Optional[dict[str, Any]] = None
    live: Optional[dict[str, Any]] = None


class StripeSettingsOut(BaseModel):
    enabled: bool = False
    mode: Literal["test", "live"] = "test"
    is_default: bool = False
    publishable_key: Optional[str] = None
    secret_key_set: bool = False
    webhook_secret_set: bool = False
    test: dict[str, Any] = {}
    live: dict[str, Any] = {}


# ─── Razorpay ────────────────────────────────────────────────────────────────

class RazorpaySettingsIn(BaseModel):
    enabled: Optional[bool] = None
    mode: Optional[Literal["test", "live"]] = None
    is_default: Optional[bool] = None
    key_id: Optional[str] = Field(None, max_length=500)
    key_secret: Optional[str] = Field(None, max_length=500)
    webhook_secret: Optional[str] = Field(None, max_length=500)
    test: Optional[dict[str, Any]] = None
    live: Optional[dict[str, Any]] = None


class RazorpaySettingsOut(BaseModel):
    enabled: bool = False
    mode: Literal["test", "live"] = "test"
    is_default: bool = False
    key_id: Optional[str] = None
    key_secret_set: bool = False
    webhook_secret_set: bool = False
    test: dict[str, Any] = {}
    live: dict[str, Any] = {}


# ─── Cashfree ────────────────────────────────────────────────────────────────

class CashfreeSettingsIn(BaseModel):
    enabled: Optional[bool] = None
    mode: Optional[Literal["test", "live"]] = None
    is_default: Optional[bool] = None
    app_id: Optional[str] = Field(None, max_length=500)
    app_secret: Optional[str] = Field(None, max_length=500)
    test: Optional[dict[str, Any]] = None
    live: Optional[dict[str, Any]] = None


class CashfreeSettingsOut(BaseModel):
    enabled: bool = False
    mode: Literal["test", "live"] = "test"
    is_default: bool = False
    app_id: Optional[str] = None
    app_secret_set: bool = False
    test: dict[str, Any] = {}
    live: dict[str, Any] = {}


# ─── Combined ─────────────────────────────────────────────────────────────────

class PaymentGatewaysIn(BaseModel):
    default_gateway: Optional[Literal["cashfree", "razorpay", "stripe", "paypal"]] = None
    paypal: Optional[PayPalSettingsIn] = None
    stripe: Optional[StripeSettingsIn] = None
    razorpay: Optional[RazorpaySettingsIn] = None
    cashfree: Optional[CashfreeSettingsIn] = None


class PaymentGatewaysOut(BaseModel):
    default_gateway: Optional[Literal["cashfree", "razorpay", "stripe", "paypal"]]
    paypal: PayPalSettingsOut
    stripe: StripeSettingsOut
    razorpay: RazorpaySettingsOut
    cashfree: CashfreeSettingsOut
