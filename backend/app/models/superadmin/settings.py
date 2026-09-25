from sqlalchemy import Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class SuperadminSettings(Base, UUIDMixin, TimestampMixin):
    """
    Singleton table storing platform-wide settings owned by the superadmin.

    Contains general contact info, outgoing SMTP config, and global payment
    gateway credentials (encrypted) — completely separate from per-client
    site_config / payment_gateways JSONB columns on the clients table.
    """

    __tablename__ = "superadmin_settings"

    config: Mapped[dict] = mapped_column(
        JSONB, default=dict, nullable=False, server_default="{}"
    )
    """
    Flat JSONB blob keyed by section:
      general:          company_name, contact_email, phone, address1, address2,
                        youtube_url, instagram_url, facebook_url
      email:            admin_email, mail_server, mail_port, mail_login,
                        mail_password (Fernet-encrypted)
      payment_gateway:  paypal.enabled, paypal.mode, paypal.client_id,
                        paypal.client_secret (encrypted);
                        stripe.enabled, stripe.mode, stripe.publishable_key,
                        stripe.secret_key (encrypted), stripe.webhook_secret (encrypted)
    """
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
