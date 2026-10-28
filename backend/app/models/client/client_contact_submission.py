import uuid

from sqlalchemy import Enum, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin
from app.models.client.contact_submission import ContactSubmissionStatus


class ClientContactSubmission(Base, UUIDMixin, TimestampMixin):
    """Storefront Contact Us submission for a tenant; separate from superadmin main-site inquiries."""

    __tablename__ = "client_contact_submissions"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # List of {id, label, type, value} captured at submit time so renamed fields keep their original labels.
    form_data: Mapped[list] = mapped_column(JSONB, nullable=False)
    status: Mapped[ContactSubmissionStatus] = mapped_column(
        Enum(ContactSubmissionStatus, name="contactsubmissionstatus", create_type=False),
        default=ContactSubmissionStatus.UNREAD,
        nullable=False,
    )
