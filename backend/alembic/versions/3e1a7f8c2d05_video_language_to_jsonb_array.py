"""video_language_to_jsonb_array

Revision ID: 3e1a7f8c2d05
Revises: ff421573efb2
Create Date: 2026-04-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '3e1a7f8c2d05'
down_revision: Union[str, None] = 'c7d2a9b14e05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Convert content_videos.language from VARCHAR(50) to JSONB array.
    # Existing comma-separated strings (e.g. "English,Spanish") are split into
    # native JSON arrays (e.g. ["English", "Spanish"]). NULL stays NULL.
    op.execute("""
        ALTER TABLE content_videos
        ALTER COLUMN language TYPE JSONB
        USING CASE
            WHEN language IS NULL OR language = '' THEN NULL
            ELSE to_jsonb(string_to_array(language, ','))
        END
    """)


def downgrade() -> None:
    # Revert from JSONB array back to VARCHAR(500).
    # Arrays are joined with commas. NULL stays NULL.
    op.execute("""
        ALTER TABLE content_videos
        ALTER COLUMN language TYPE VARCHAR(500)
        USING CASE
            WHEN language IS NULL THEN NULL
            ELSE array_to_string(
                ARRAY(SELECT jsonb_array_elements_text(language)),
                ','
            )
        END
    """)
