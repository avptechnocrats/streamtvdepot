import uuid

from pydantic import BaseModel


class CheckoutInitiateRequest(BaseModel):
    plan_id: uuid.UUID
    gateway: str | None = None          # "stripe" | "paypal" | "razorpay" | "cashfree" | None
    payment_method_id: str | None = None  # Existing Stripe PaymentMethod selected by the user
    content_id: uuid.UUID | None = None  # Required for PPV (livestream) and Rent (video)
    coupon_code: str | None = None      # Optional coupon code for discount
    country: str | None = None          # ISO 3166-1 alpha-2 code (e.g., 'IN', 'US') for localized pricing
    skip_trial: bool = False            # True forces the normal paid flow, bypassing an available trial


class CheckoutTaxLine(BaseModel):
    name: str
    tax_type: str
    percentage: float | None = None
    flat_amount: float | None = None
    amount: float


class CheckoutInitiateResponse(BaseModel):
    payment_id: uuid.UUID
    gateway: str
    amount: float | None = None
    currency: str | None = None
    subtotal: float | None = None
    tax_amount: float = 0
    tax_lines: list[CheckoutTaxLine] = []
    # Coupon details
    coupon_applied: bool = False
    original_amount: float | None = None
    discount_amount: float | None = None
    # Gateway-specific fields
    stripe_client_secret: str | None = None
    paypal_order_id: str | None = None
    paypal_approval_url: str | None = None
    razorpay_order_id: str | None = None
    razorpay_key_id: str | None = None
    cashfree_order_id: str | None = None
    cashfree_payment_session_id: str | None = None
    cashfree_mode: str | None = None
    subscription_id: uuid.UUID | None = None
    invoice_number: str | None = None


class CheckoutTaxQuoteRequest(BaseModel):
    plan_id: uuid.UUID
    coupon_code: str | None = None


class CheckoutTaxQuoteResponse(BaseModel):
    subtotal: float
    tax_amount: float
    total: float
    currency: str
    tax_lines: list[CheckoutTaxLine] = []


class CheckoutConfirmRequest(BaseModel):
    payment_id: uuid.UUID
    # Stripe
    stripe_payment_intent_id: str | None = None
    # PayPal
    paypal_order_id: str | None = None
    paypal_payer_id: str | None = None
    # Razorpay
    razorpay_order_id: str | None = None
    razorpay_payment_id: str | None = None
    razorpay_signature: str | None = None
    # Cashfree
    cashfree_order_id: str | None = None


class CheckoutConfirmResponse(BaseModel):
    success: bool
    subscription_id: uuid.UUID
    invoice_number: str


class GatewayConfigOut(BaseModel):
    stripe_enabled: bool
    paypal_enabled: bool
    razorpay_enabled: bool
    cashfree_enabled: bool
    default_gateway: str | None = None
    stripe_publishable_key: str | None = None
    razorpay_key_id: str | None = None
    cashfree_mode: str | None = None
    coupon_code: str | None = None  # Optional coupon code for discount


class UpgradeInitiateRequest(BaseModel):
    new_plan_id: uuid.UUID
    gateway: str | None = None   # "stripe" | "paypal" | None → auto-detect
    payment_method_id: str | None = None  # Existing Stripe PaymentMethod selected by the user
    country: str | None = None   # ISO 3166-1 alpha-2 code for localized pricing


class UpgradeInitiateResponse(BaseModel):
    """
    Returned by POST /checkout/upgrade/initiate.

    - If ``payment_required`` is False the upgrade was applied for free
      (unused credit covered the full new plan cost) and ``subscription_id``
      contains the new subscription UUID.  No confirm call is needed.
    - If ``payment_required`` is True the caller must complete the payment
      via the gateway and then call POST /checkout/confirm as normal.
    """
    payment_required: bool
    # Fields present when payment_required is False (immediate free upgrade)
    subscription_id: uuid.UUID | None = None
    # Fields present when payment_required is True
    payment_id: uuid.UUID | None = None
    gateway: str | None = None
    prorated_charge: float | None = None
    currency: str | None = None
    stripe_client_secret: str | None = None
    paypal_order_id: str | None = None
    paypal_approval_url: str | None = None
    razorpay_order_id: str | None = None
    razorpay_key_id: str | None = None
    cashfree_order_id: str | None = None
    cashfree_payment_session_id: str | None = None
    cashfree_mode: str | None = None


class ScheduleDowngradeRequest(BaseModel):
    new_plan_id: uuid.UUID


class ScheduleDowngradeResponse(BaseModel):
    subscription_id: uuid.UUID
    starts_at: str
    expires_at: str | None = None


class CouponValidateRequest(BaseModel):
    coupon_code: str
    plan_id: uuid.UUID
    amount: float  # Original plan amount before discount


class CouponValidateResponse(BaseModel):
    valid: bool
    message: str
    discount_amount: float | None = None
    final_amount: float | None = None
    discount_percentage: float | None = None


class PaymentMethodSetupResponse(BaseModel):
    """Returned by POST /checkout/payment-method/setup-intent."""
    gateway: str
    stripe_client_secret: str | None = None
    stripe_publishable_key: str | None = None


class PaymentMethodStatusResponse(BaseModel):
    has_payment_method: bool
    gateway: str | None = None


class SavedPaymentMethodOut(BaseModel):
    id: str
    gateway: str
    type: str
    brand: str | None = None
    last4: str | None = None
    exp_month: int | None = None
    exp_year: int | None = None
    is_default: bool = False


class SavedPaymentMethodsResponse(BaseModel):
    payment_methods: list[SavedPaymentMethodOut]
    paypal_connected: bool = False

