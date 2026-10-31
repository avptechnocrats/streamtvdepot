"""Move tenant site content and banners out of client configuration JSON."""

import uuid
from datetime import datetime, timedelta, timezone

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "j5k6l7m8n9o0"
down_revision = "i4j5k6l7m8n9"
branch_labels = None
depends_on = None


def _identity_columns():
    return [sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())]


def upgrade():
    site_content = op.create_table(
        "client_site_content", *_identity_columns(),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("menu_management", postgresql.JSONB(), nullable=False),
        sa.Column("faq_content", postgresql.JSONB(), nullable=False),
        sa.Column("contact_content", postgresql.JSONB(), nullable=False),
        sa.Column("comment", sa.Text()),
    )
    op.create_unique_constraint("uq_media_assets_id_client", "media_assets", ["id", "client_id"])
    banners = op.create_table(
        "client_banners", *_identity_columns(),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("page", sa.String(32), nullable=False),
        sa.Column("position", sa.String(16), nullable=False),
        sa.Column("border_enabled", sa.Boolean(), nullable=False),
        sa.Column("border_width", sa.Integer(), nullable=False),
        sa.Column("border_color", sa.String(7), nullable=False),
        sa.Column("border_radius", sa.Integer(), nullable=False),
        sa.Column("padding", sa.Integer(), nullable=False),
        sa.UniqueConstraint("id", "client_id", name="uq_client_banners_id_client"),
        sa.CheckConstraint("page IN ('/', '/movies', '/series', '/tv-shows', '/ppv-events')", name="ck_client_banners_page"),
        sa.CheckConstraint("position IN ('top', 'middle_1', 'middle_2', 'bottom')", name="ck_client_banners_position"),
        sa.CheckConstraint("border_width BETWEEN 0 AND 32 AND border_radius BETWEEN 0 AND 128 AND padding BETWEEN 0 AND 128", name="ck_client_banners_border"),
    )
    op.create_index("ix_client_banners_client_page_position", "client_banners", ["client_id", "page", "position"])
    images = op.create_table(
        "client_banner_images", *_identity_columns(),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("banner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("media_asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("size_variant", sa.String(16), nullable=False),
        sa.ForeignKeyConstraint(["banner_id", "client_id"], ["client_banners.id", "client_banners.client_id"], ondelete="CASCADE", name="fk_banner_images_banner_tenant"),
        sa.ForeignKeyConstraint(["media_asset_id", "client_id"], ["media_assets.id", "media_assets.client_id"], ondelete="RESTRICT", name="fk_banner_images_asset_tenant"),
        sa.UniqueConstraint("banner_id", "size_variant", name="uq_banner_images_variant"),
        sa.CheckConstraint("size_variant IN ('custom', 'desktop', 'tablet', 'mobile')", name="ck_banner_images_variant"),
    )
    op.create_index("ix_banner_images_media_asset", "client_banner_images", ["media_asset_id", "client_id"])
    bind = op.get_bind()
    clients = sa.table("clients", sa.column("id", postgresql.UUID()), sa.column("theme_config", postgresql.JSONB()), sa.column("site_config", postgresql.JSONB()))
    assets = sa.table("media_assets", sa.column("id", postgresql.UUID()), sa.column("client_id", postgresql.UUID()), sa.column("width", sa.Integer()), sa.column("height", sa.Integer()))
    for client in bind.execute(sa.select(clients)).mappings():
        theme = dict(client["theme_config"] or {})
        site = dict(client["site_config"] or {})
        if "menu_management" in theme or "faq_content" in site or "contact_content" in site:
            content = {"menu_management": theme.get("menu_management") or {}, "faq_content": site.get("faq_content") or {}, "contact_content": site.get("contact_content") or {}}
            if any(not isinstance(value, dict) for value in content.values()):
                raise ValueError(f"Invalid site content for tenant {client['id']}; migration aborted")
            bind.execute(site_content.insert().values(id=uuid.uuid4(), client_id=client["id"], **content))
        migrated_at = datetime.now(timezone.utc)
        for banner_index, banner in enumerate(theme.get("managed_banners") or []):
            banner_id = uuid.UUID(str(banner["id"]))
            if not banner.get("images"):
                raise ValueError(f"Banner {banner_id} has no images; migration aborted")
            bind.execute(banners.insert().values(
                id=banner_id, client_id=client["id"], name=banner["name"], page=banner["page"], position=banner["position"],
                created_at=migrated_at + timedelta(microseconds=banner_index),
                border_enabled=banner.get("border_enabled", False), border_width=banner.get("border_width", 1),
                border_color=banner.get("border_color", "#cccccc"), border_radius=banner.get("border_radius", 0), padding=banner.get("padding", 0),
            ))
            for variant, image in banner["images"].items():
                asset_id = uuid.UUID(str(image["asset_id"]))
                asset = bind.execute(sa.select(assets).where(assets.c.id == asset_id, assets.c.client_id == client["id"])).mappings().one_or_none()
                if asset is None or (asset["width"], asset["height"]) != (image["width"], image["height"]):
                    raise ValueError(f"Invalid asset for banner {banner_id}; migration aborted")
                bind.execute(images.insert().values(id=uuid.uuid4(), client_id=client["id"], banner_id=banner_id, media_asset_id=asset_id, size_variant=variant))
        if "menu_management" in theme or "managed_banners" in theme:
            theme.pop("menu_management", None)
            theme.pop("managed_banners", None)
            bind.execute(clients.update().where(clients.c.id == client["id"]).values(theme_config=theme))
        if "faq_content" in site or "contact_content" in site:
            site.pop("faq_content", None)
            site.pop("contact_content", None)
            bind.execute(clients.update().where(clients.c.id == client["id"]).values(site_config=site))


def downgrade():
    bind = op.get_bind()
    metadata = sa.MetaData()
    clients = sa.Table("clients", metadata, autoload_with=bind)
    content = sa.Table("client_site_content", metadata, autoload_with=bind)
    banners = sa.Table("client_banners", metadata, autoload_with=bind)
    images = sa.Table("client_banner_images", metadata, autoload_with=bind)
    assets = sa.Table("media_assets", metadata, autoload_with=bind)
    for client in bind.execute(sa.select(clients.c.id, clients.c.theme_config, clients.c.site_config)).mappings():
        theme = dict(client["theme_config"] or {})
        site = dict(client["site_config"] or {})
        row = bind.execute(sa.select(content).where(content.c.client_id == client["id"])).mappings().one_or_none()
        if row:
            theme["menu_management"] = row["menu_management"]
            site["faq_content"] = row["faq_content"]
            site["contact_content"] = row["contact_content"]
        restored = []
        for banner in bind.execute(sa.select(banners).where(banners.c.client_id == client["id"]).order_by(banners.c.created_at, banners.c.id)).mappings():
            data = {key: banner[key] for key in ("name", "page", "position", "border_enabled", "border_width", "border_color", "border_radius", "padding")}
            data.update(id=str(banner["id"]), images={})
            statement = sa.select(images.c.size_variant, assets.c.id, assets.c.url, assets.c.width, assets.c.height).select_from(images.join(assets, sa.and_(images.c.media_asset_id == assets.c.id, images.c.client_id == assets.c.client_id))).where(images.c.banner_id == banner["id"], images.c.client_id == client["id"])
            for image in bind.execute(statement).mappings():
                data["images"][image["size_variant"]] = {"asset_id": str(image["id"]), "url": image["url"], "width": image["width"], "height": image["height"]}
            restored.append(data)
        if restored:
            theme["managed_banners"] = restored
        bind.execute(clients.update().where(clients.c.id == client["id"]).values(theme_config=theme, site_config=site))
    op.drop_table("client_banner_images")
    op.drop_table("client_banners")
    op.drop_constraint("uq_media_assets_id_client", "media_assets", type_="unique")
    op.drop_table("client_site_content")