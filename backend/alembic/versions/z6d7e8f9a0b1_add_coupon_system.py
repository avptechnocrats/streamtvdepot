"""Add coupon system

Revision ID: z6d7e8f9a0b1
Revises: z5c6d7e8f9a0
Create Date: 2026-08-20 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers, used by Alembic.
revision: str = 'z6d7e8f9a0b1'
down_revision: Union[str, None] = "z5c6d7e8f9a0"  # Replace with actual previous revision
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create coupons table
    op.create_table(
        'coupons',
        sa.Column('id', UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('client_id', UUID(as_uuid=True), nullable=False),
        sa.Column('code', sa.String(50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('discount_type', sa.Enum('percentage', 'fixed_amount', name='discounttype'), nullable=False),
        sa.Column('discount_value', sa.Numeric(10, 2), nullable=False),
        sa.Column('min_amount', sa.Numeric(10, 2), nullable=True),
        sa.Column('max_discount_amount', sa.Numeric(10, 2), nullable=True),
        sa.Column('max_uses', sa.Integer(), nullable=True),
        sa.Column('max_uses_per_user', sa.Integer(), nullable=True),
        sa.Column('current_uses', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('valid_from', sa.String(50), nullable=True),
        sa.Column('valid_until', sa.String(50), nullable=True),
        sa.Column('applies_to_plan_ids', JSONB, nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_coupons_client_id', 'coupons', ['client_id'])
    op.create_index('ix_coupons_code', 'coupons', ['code'])

    # Create coupon_usages table
    op.create_table(
        'coupon_usages',
        sa.Column('id', UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('client_id', UUID(as_uuid=True), nullable=False),
        sa.Column('coupon_id', UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), nullable=False),
        sa.Column('payment_id', UUID(as_uuid=True), nullable=False),
        sa.Column('discount_amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('original_amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('final_amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('used_at', sa.String(50), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['coupon_id'], ['coupons.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['end_users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['payment_id'], ['payments.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_coupon_usages_client_id', 'coupon_usages', ['client_id'])
    op.create_index('ix_coupon_usages_coupon_id', 'coupon_usages', ['coupon_id'])
    op.create_index('ix_coupon_usages_user_id', 'coupon_usages', ['user_id'])

    # Add coupon fields to payments table
    op.add_column('payments', sa.Column('coupon_id', UUID(as_uuid=True), nullable=True))
    op.add_column('payments', sa.Column('discount_amount', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.add_column('payments', sa.Column('original_amount', sa.Numeric(10, 2), nullable=True))
    op.create_foreign_key('fk_payments_coupon_id', 'payments', 'coupons', ['coupon_id'], ['id'], ondelete='SET NULL')

    # Add coupon fields to invoices table
    op.add_column('invoices', sa.Column('coupon_code', sa.String(50), nullable=True))
    op.add_column('invoices', sa.Column('discount_amount', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.add_column('invoices', sa.Column('original_amount', sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    # Remove coupon fields from invoices
    op.drop_column('invoices', 'original_amount')
    op.drop_column('invoices', 'discount_amount')
    op.drop_column('invoices', 'coupon_code')

    # Remove coupon fields from payments
    op.drop_constraint('fk_payments_coupon_id', 'payments', type_='foreignkey')
    op.drop_column('payments', 'original_amount')
    op.drop_column('payments', 'discount_amount')
    op.drop_column('payments', 'coupon_id')

    # Drop coupon_usages table
    op.drop_index('ix_coupon_usages_user_id', 'coupon_usages')
    op.drop_index('ix_coupon_usages_coupon_id', 'coupon_usages')
    op.drop_index('ix_coupon_usages_client_id', 'coupon_usages')
    op.drop_table('coupon_usages')

    # Drop coupons table
    op.drop_index('ix_coupons_code', 'coupons')
    op.drop_index('ix_coupons_client_id', 'coupons')
    op.drop_table('coupons')

    # Drop enum type
    op.execute('DROP TYPE discounttype')
