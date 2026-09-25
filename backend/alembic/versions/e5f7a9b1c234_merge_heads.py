"""Merge a1c3e2f84b90 and d4e6f8b0c123 into a single head

Revision ID: e5f7a9b1c234
Revises: a1c3e2f84b90, d4e6f8b0c123
Create Date: 2026-04-23

"""
from collections.abc import Sequence

# ── Revision identifiers ──────────────────────────────────────────────────────

revision: str = "e5f7a9b1c234"
down_revision: tuple[str, str] = ("a1c3e2f84b90", "d4e6f8b0c123")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
