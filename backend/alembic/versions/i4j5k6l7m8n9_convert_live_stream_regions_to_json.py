"""convert live stream regions to JSON arrays

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-10-30
"""
from alembic import op


revision = "i4j5k6l7m8n9"
down_revision = "h3i4j5k6l7m8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'content_live_streams'
                  AND column_name = 'region'
                  AND udt_name <> 'jsonb'
            ) THEN
                ALTER TABLE content_live_streams ALTER COLUMN region DROP DEFAULT;
                ALTER TABLE content_live_streams
                    ALTER COLUMN region TYPE JSONB
                    USING CASE
                        WHEN region IS NULL THEN '[]'::jsonb
                        ELSE jsonb_build_array(region)
                    END;
            END IF;

            UPDATE content_live_streams
            SET region = CASE
                WHEN region IS NULL THEN '[]'::jsonb
                WHEN jsonb_typeof(region) = 'array' THEN region
                ELSE jsonb_build_array(region)
            END;

            ALTER TABLE content_live_streams
                ALTER COLUMN region SET DEFAULT '[]'::jsonb,
                ALTER COLUMN region SET NOT NULL;
        END $$;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE content_live_streams ALTER COLUMN region DROP DEFAULT;
        ALTER TABLE content_live_streams ALTER COLUMN region DROP NOT NULL;
        ALTER TABLE content_live_streams
            ALTER COLUMN region TYPE VARCHAR(32)
            USING CASE
                WHEN jsonb_array_length(region) = 0 THEN NULL
                ELSE region->>0
            END;
    """)