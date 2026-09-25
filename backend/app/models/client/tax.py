import uuid

from sqlalchemy import Boolean, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class ClientTax(Base, UUIDMixin, TimestampMixin):
    """A percentage or flat tax configured by a tenant for its storefront."""

    __tablename__ = "client_taxes"
    __table_args__ = (
        UniqueConstraint("client_id", "name", name="uq_client_taxes_client_name"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    tax_type: Mapped[str] = mapped_column(String(20), nullable=False, default="percentage")
    percentage: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    flat_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)