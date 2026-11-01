"""Link videos to a public preview rendition of their uploaded trailer."""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "s8t9u0v1w2x3"
down_revision: str | None = "r7s8t9u0v1w2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "content_videos",
        sa.Column(
            "trailer_rendition_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("media_asset_renditions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_content_videos_trailer_rendition_id", "content_videos", ["trailer_rendition_id"])


def downgrade() -> None:
    op.drop_index("ix_content_videos_trailer_rendition_id", table_name="content_videos")
    op.drop_column("content_videos", "trailer_rendition_id")
