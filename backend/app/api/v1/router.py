from fastapi import APIRouter

from app.api.v1.auth.router import router as auth_router
from app.api.v1.superadmin.router import router as superadmin_router
from app.api.v1.admin.router import router as admin_router
from app.api.v1.public.router import router as public_router
from app.api.v1.drm import router as drm_router
from app.api.v1.media.stream import router as media_stream_router
from app.api.v1.rtmp_callbacks import router as rtmp_router
from app.api.v1.webhooks import router as webhooks_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth")
api_router.include_router(superadmin_router, prefix="/superadmin")
api_router.include_router(admin_router, prefix="/admin")
api_router.include_router(public_router, prefix="/public")
api_router.include_router(drm_router, prefix="/drm", tags=["DRM – Key Delivery"])
api_router.include_router(media_stream_router, prefix="/media/stream", tags=["Media – HLS Proxy"])
api_router.include_router(rtmp_router, prefix="/rtmp", tags=["RTMP Callbacks"])
api_router.include_router(webhooks_router, prefix="/webhooks")
