import enum
import uuid

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Table, Column, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class AdminRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


client_role_permissions = Table(
    "client_role_permissions",
    Base.metadata,
    Column("role_id", UUID(as_uuid=True), ForeignKey("client_roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_code", String(100), ForeignKey("client_permissions.code", ondelete="CASCADE"), primary_key=True),
)


class ClientPermission(Base):
    """A global, code-defined permission which can be granted through tenant roles."""

    __tablename__ = "client_permissions"

    code: Mapped[str] = mapped_column(String(100), primary_key=True)
    module: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)


class ClientRole(Base, UUIDMixin, TimestampMixin):
    """A reusable, tenant-owned role assigned to client-admin users."""

    __tablename__ = "client_roles"
    __table_args__ = (
        UniqueConstraint("client_id", "name", name="uq_client_roles_client_name"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    is_owner_role: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_system_role: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    permissions: Mapped[list["ClientPermission"]] = relationship(
        secondary=client_role_permissions,
        lazy="selectin",
    )


class ClientAdminUser(Base, UUIDMixin, TimestampMixin):
    """Admin users who manage a specific client's platform."""

    __tablename__ = "client_admin_users"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[AdminRole] = mapped_column(
        Enum(AdminRole), default=AdminRole.ADMIN, nullable=False
    )
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_roles.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    content_partner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_partners.id", ondelete="CASCADE"), nullable=True, unique=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    client: Mapped["Client"] = relationship(foreign_keys=[client_id])
    access_role: Mapped["ClientRole | None"] = relationship(foreign_keys=[role_id], lazy="selectin")


class EndUser(Base, UUIDMixin, TimestampMixin):
    """End users of a client's platform."""

    __tablename__ = "end_users"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50))
    avatar_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True
    )
    avatar_url: Mapped[str | None] = mapped_column(String(2_000_000))  # ~1.5MB base64 encoded image
    country: Mapped[str | None] = mapped_column(String(100))
    # Billing address (used for payment compliance, e.g. Stripe India exports)
    billing_line1: Mapped[str | None] = mapped_column(String(255))
    billing_line2: Mapped[str | None] = mapped_column(String(255))
    billing_city: Mapped[str | None] = mapped_column(String(100))
    billing_state: Mapped[str | None] = mapped_column(String(100))
    billing_postal_code: Mapped[str | None] = mapped_column(String(20))
    billing_country: Mapped[str | None] = mapped_column(String(2))  # ISO 3166-1 alpha-2
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_verification_otp_hash: Mapped[str | None] = mapped_column(String(64))
    email_verification_otp_expires_at: Mapped[object | None] = mapped_column(DateTime(timezone=True))
    email_verification_otp_attempts: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    # Stored after first successful Stripe payment to enable off-session subscription auto-renewal
    stripe_customer_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Stored after first successful PayPal payment to enable off-session subscription auto-renewal
    paypal_vault_id: Mapped[str | None] = mapped_column(String(100), nullable=True)


class UserWatchlist(Base, UUIDMixin):
    """A single item in an end-user's watchlist."""

    __tablename__ = "user_watchlist"
    __table_args__ = (
        UniqueConstraint("user_id", "video_id", name="uq_watchlist_user_video"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("end_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Stores a content_videos.id; kept as plain UUID (no FK) so it survives
    # content deletion without cascading hard deletes on the watchlist.
    video_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    added_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
