"""add_content_types_to_categories

Replaces the single content_type VARCHAR with a content_types JSONB array.
Existing rows are migrated: old value becomes a single-element array.

Revision ID: z5c6d7e8f9a0
Revises: z4b5c6d7e8f9
Create Date: 2026-08-19 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "z5c6d7e8f9a0"
down_revision: Union[str, None] = "z4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "content_categories",
        sa.Column(
            "content_types",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    # Migrate existing single content_type value into the new array
    op.execute(
        """
        UPDATE content_categories
        SET content_types = to_jsonb(ARRAY[content_type])
        WHERE content_type IS NOT NULL
        """
    )
    op.drop_column("content_categories", "content_type")


def downgrade() -> None:
    op.add_column(
        "content_categories",
        sa.Column("content_type", sa.String(20), nullable=True),
    )
    op.execute(
        """
        UPDATE content_categories
        SET content_type = content_types->>0
        WHERE jsonb_array_length(content_types) > 0
        """
    )
    op.drop_column("content_categories", "content_types")
