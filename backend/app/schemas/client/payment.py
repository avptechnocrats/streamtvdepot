import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.client.payment import PaymentMethod, PaymentStatus


class PaymentOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    user_id: uuid.UUID
    amount: float
    currency: str
    status: PaymentStatus
    payment_method: PaymentMethod
    gateway_transaction_id: str | None
    reference_type: str | None
    reference_id: str | None
    paid_at: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaymentAdminOut(PaymentOut):
    """PaymentOut extended with denormalised end-user info for the admin panel."""
    user_name: str | None = None
    user_email: str | None = None


class InvoiceOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    user_id: uuid.UUID
    payment_id: uuid.UUID
    invoice_number: str
    amount: float
    currency: str
    tax_amount: float
    issued_at: str
    due_at: str | None
    pdf_url: str | None
    created_at: datetime
    user_name: str | None = None
    user_email: str | None = None
    user_address: str | None = None
    client_name: str | None = None
    client_address: str | None = None
    client_logo_url: str | None = None

    model_config = {"from_attributes": True}
