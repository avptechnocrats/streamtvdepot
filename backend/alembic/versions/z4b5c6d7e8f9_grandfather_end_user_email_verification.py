"""grandfather existing end user email verification

Existing end users signed up before verification existed, so mark them verified
to avoid locking them out when END_USER_EMAIL_VERIFICATION_REQUIRED is enabled.

Revision ID: z4b5c6d7e8f9
Revises: z3a4b5c6d7e8
Create Date: 2026-08-17 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "z4b5c6d7e8f9"
down_revision: Union[str, None] = "z3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE end_users SET is_email_verified = true WHERE is_email_verified = false")


def downgrade() -> None:
    pass
