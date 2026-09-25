from sqlalchemy import Boolean, Float, ForeignKey, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin
import uuid


class ClientMonthlyUsage(Base, UUIDMixin, TimestampMixin):
    """Monthly usage aggregation per client — updated incrementally or via a nightly job."""

    __tablename__ = "client_monthly_usage"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    billing_year: Mapped[int] = mapped_column(Integer, nullable=False)
    billing_month: Mapped[int] = mapped_column(Integer, nullable=False)  # 1–12

    # ── Actual Usage ────────────────────────────────────────────────────────────
    storage_gb_used: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    bandwidth_gb_used: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    encoding_minutes_used: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    api_calls_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    concurrent_users_peak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Content Counts ──────────────────────────────────────────────────────────
    total_videos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_audio: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_live_streams: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_end_users: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_admin_users: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Overage Charges ─────────────────────────────────────────────────────────
    overage_storage: Mapped[float] = mapped_column(Numeric(12, 4), default=0, nullable=False)
    overage_bandwidth: Mapped[float] = mapped_column(Numeric(12, 4), default=0, nullable=False)
    overage_encoding: Mapped[float] = mapped_column(Numeric(12, 4), default=0, nullable=False)
    overage_api: Mapped[float] = mapped_column(Numeric(12, 4), default=0, nullable=False)
    total_overage: Mapped[float] = mapped_column(Numeric(12, 4), default=0, nullable=False)

    # ── Invoice ─────────────────────────────────────────────────────────────────
    base_fee: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    total_invoice: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    is_finalized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    currency: Mapped[str] = mapped_column(default="USD", nullable=False)

    # ── Relationship ────────────────────────────────────────────────────────────
    client: Mapped["Client"] = relationship("Client")  # type: ignore
