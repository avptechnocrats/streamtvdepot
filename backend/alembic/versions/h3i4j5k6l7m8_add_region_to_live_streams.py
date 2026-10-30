"""add region to live streams

Revision ID: h3i4j5k6l7m8
Revises: g6b7c8d9e0f1
Create Date: 2026-10-30
"""
from alembic import op


revision = "h3i4j5k6l7m8"
down_revision = "g6b7c8d9e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE content_live_streams ADD COLUMN IF NOT EXISTS region JSONB NOT NULL DEFAULT '[]'::jsonb")


def downgrade() -> None:
    op.execute("ALTER TABLE content_live_streams DROP COLUMN IF EXISTS region")