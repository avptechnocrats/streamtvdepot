import enum
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin

_RESET_TOKEN_TTL_HOURS = 2


class ResetUserType(str, enum.Enum):
    SUPERADMIN = "superadmin"
    CLIENT_ADMIN = "client_admin"
    END_USER = "end_user"


class PasswordResetToken(Base, UUIDMixin, TimestampMixin):
    """Single-use password reset token, scoped per user type."""

    __tablename__ = "password_reset_tokens"

    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_type: Mapped[ResetUserType] = mapped_column(Enum(ResetUserType), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    @classmethod
    def make(cls, user_type: ResetUserType, user_id: uuid.UUID) -> "PasswordResetToken":
        return cls(
            token=uuid.uuid4().hex + uuid.uuid4().hex,  # 64 hex chars
            user_type=user_type,
            user_id=user_id,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=_RESET_TOKEN_TTL_HOURS),
        )

    @property
    def is_valid(self) -> bool:
        return not self.is_used and datetime.now(timezone.utc) < self.expires_at.replace(
            tzinfo=timezone.utc
        )
