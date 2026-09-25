"""add end user email otp fields

Revision ID: v4w5x6y7z8a9
Revises: b9c0d1e2f3a4
Create Date: 2026-09-02 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "v4w5x6y7z8a9"
down_revision: Union[str, None] = "b9c0d1e2f3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("end_users", sa.Column("email_verification_otp_hash", sa.String(length=64), nullable=True))
    op.add_column("end_users", sa.Column("email_verification_otp_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("end_users", sa.Column("email_verification_otp_attempts", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("end_users", "email_verification_otp_attempts")
    op.drop_column("end_users", "email_verification_otp_expires_at")
    op.drop_column("end_users", "email_verification_otp_hash")