"""add_client_monthly_usage_table

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-06-23 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'client_monthly_usage',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('client_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('billing_year', sa.Integer(), nullable=False),
        sa.Column('billing_month', sa.Integer(), nullable=False),
        # Usage
        sa.Column('storage_gb_used', sa.Float(), nullable=False, server_default='0'),
        sa.Column('bandwidth_gb_used', sa.Float(), nullable=False, server_default='0'),
        sa.Column('encoding_minutes_used', sa.Float(), nullable=False, server_default='0'),
        sa.Column('api_calls_used', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('concurrent_users_peak', sa.Integer(), nullable=False, server_default='0'),
        # Content Counts
        sa.Column('total_videos', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_audio', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_live_streams', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_end_users', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_admin_users', sa.Integer(), nullable=False, server_default='0'),
        # Overage Charges
        sa.Column('overage_storage', sa.Numeric(12, 4), nullable=False, server_default='0'),
        sa.Column('overage_bandwidth', sa.Numeric(12, 4), nullable=False, server_default='0'),
        sa.Column('overage_encoding', sa.Numeric(12, 4), nullable=False, server_default='0'),
        sa.Column('overage_api', sa.Numeric(12, 4), nullable=False, server_default='0'),
        sa.Column('total_overage', sa.Numeric(12, 4), nullable=False, server_default='0'),
        # Invoice
        sa.Column('base_fee', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('total_invoice', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('is_finalized', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('currency', sa.String(10), nullable=False, server_default='USD'),
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('client_id', 'billing_year', 'billing_month', name='uq_client_monthly_usage'),
    )
    op.create_index(op.f('ix_client_monthly_usage_client_id'), 'client_monthly_usage', ['client_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_client_monthly_usage_client_id'), table_name='client_monthly_usage')
    op.drop_table('client_monthly_usage')
