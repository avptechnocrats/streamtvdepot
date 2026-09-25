"""add video lifecycle status

Revision ID: b9c0d1e2f3a4
Revises: a7b8c9d0e1f2
"""

from alembic import op
import sqlalchemy as sa


revision = "b9c0d1e2f3a4"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$
        DECLARE
            published_label text;
            draft_label text;
        BEGIN
            SELECT enumlabel INTO published_label
              FROM pg_enum
             WHERE enumtypid = 'contentstatus'::regtype
               AND lower(enumlabel) = 'published';
            SELECT enumlabel INTO draft_label
              FROM pg_enum
             WHERE enumtypid = 'contentstatus'::regtype
               AND lower(enumlabel) = 'draft';

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'content_videos' AND column_name = 'status'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE content_videos ADD COLUMN status contentstatus NOT NULL DEFAULT %L',
                    published_label
                );
            END IF;
            EXECUTE format(
                'ALTER TABLE content_videos ALTER COLUMN status SET DEFAULT %L',
                draft_label
            );
        END $$;
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_content_videos_status "
        "ON content_videos (status)"
    )


def downgrade() -> None:
    op.drop_index("ix_content_videos_status", table_name="content_videos")
    op.drop_column("content_videos", "status")