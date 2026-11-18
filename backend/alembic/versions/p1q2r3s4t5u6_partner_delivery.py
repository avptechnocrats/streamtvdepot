"""Add durable partner delivery, provider identities, rights and caption tracking."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "p1q2r3s4t5u6"
down_revision = "o0p1q2r3s4t5"
branch_labels = None
depends_on = None


def common():
    return [sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())]


def upgrade():
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "partner_deliveries" not in tables:
        op.create_table("partner_deliveries", *common(),
            sa.Column("partner_id", UUID(as_uuid=True), sa.ForeignKey("content_partners.id"), nullable=False, index=True),
            sa.Column("principal_arn", sa.String(255), nullable=False), sa.Column("region", sa.String(40), nullable=False),
            sa.Column("bucket", sa.String(63), nullable=False, unique=True), sa.Column("prefix", sa.String(255), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False), sa.Column("status", sa.String(30), nullable=False, index=True),
            sa.Column("queue_url", sa.Text()), sa.Column("queue_arn", sa.Text()), sa.Column("error", sa.Text()),
            sa.Column("attempts", sa.Integer(), nullable=False), sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
            sa.Column("last_reconciled_at", sa.DateTime(timezone=True)), sa.Column("options", JSONB(), nullable=False),
            sa.UniqueConstraint("client_id", "partner_id", name="uq_partner_delivery_owner"))
    if "partner_ingests" not in tables:
        op.create_table("partner_ingests", *common(),
            sa.Column("partner_id", UUID(as_uuid=True), sa.ForeignKey("content_partners.id"), nullable=False, index=True),
            sa.Column("delivery_id", UUID(as_uuid=True), sa.ForeignKey("partner_deliveries.id"), nullable=False, index=True),
            sa.Column("metadata_key", sa.Text(), nullable=False), sa.Column("version_id", sa.String(1024), nullable=False),
            sa.Column("source_modified_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", sa.String(30), nullable=False, index=True), sa.Column("attempts", sa.Integer(), nullable=False),
            sa.Column("next_attempt_at", sa.DateTime(timezone=True)), sa.Column("error", sa.Text()),
            sa.Column("summary", JSONB(), nullable=False), sa.Column("completed_at", sa.DateTime(timezone=True)),
            sa.UniqueConstraint("delivery_id", "metadata_key", "version_id", name="uq_partner_ingest_version"))
    if "partner_content" not in tables:
        op.create_table("partner_content", *common(),
            sa.Column("partner_id", UUID(as_uuid=True), sa.ForeignKey("content_partners.id"), nullable=False, index=True),
            sa.Column("kind", sa.String(20), nullable=False), sa.Column("sku", sa.String(255), nullable=False),
            sa.Column("content_id", UUID(as_uuid=True), nullable=False, index=True), sa.Column("parent_sku", sa.String(255)),
            sa.Column("season_number", sa.Integer()), sa.Column("source_modified_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("metadata_json", JSONB(), nullable=False), sa.Column("revoked_at", sa.DateTime(timezone=True)),
            sa.UniqueConstraint("client_id", "partner_id", "kind", "sku", name="uq_partner_content_sku"))
    if "content_licenses" not in tables:
        op.create_table("content_licenses", *common(),
            sa.Column("partner_content_id", UUID(as_uuid=True), sa.ForeignKey("partner_content.id"), nullable=False, index=True),
            sa.Column("ingest_id", UUID(as_uuid=True), sa.ForeignKey("partner_ingests.id"), nullable=False, index=True),
            sa.Column("license_type", sa.String(20), nullable=False),
            sa.Column("starts_at", sa.DateTime(timezone=True)), sa.Column("ends_at", sa.DateTime(timezone=True)),
            sa.Column("included_countries", JSONB(), nullable=False), sa.Column("excluded_countries", JSONB(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True)))
    if "content_captions" not in tables:
        op.create_table("content_captions", *common(),
            sa.Column("partner_content_id", UUID(as_uuid=True), sa.ForeignKey("partner_content.id"), nullable=False, index=True),
            sa.Column("source_filename", sa.String(500), nullable=False), sa.Column("language", sa.String(40), nullable=False),
            sa.Column("kind", sa.String(40), nullable=False), sa.Column("s3_key", sa.Text(), nullable=False),
            sa.UniqueConstraint("partner_content_id", "source_filename", "language", "kind", name="uq_partner_caption"))


def downgrade():
    for table in ("content_captions", "content_licenses", "partner_content", "partner_ingests", "partner_deliveries"):
        op.drop_table(table)