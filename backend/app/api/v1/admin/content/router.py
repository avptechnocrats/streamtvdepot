from fastapi import APIRouter

from .audios import router as audios_router
from .categories import router as categories_router
from .epg import router as epg_router
from .live_streams import router as live_streams_router
from .ppv import router as ppv_router
from .rentals import router as rentals_router
from .series import router as series_router
from .videos import router as videos_router

router = APIRouter()

router.include_router(categories_router, prefix="/categories", tags=["Admin – Content: Categories"])
router.include_router(audios_router, prefix="/audios", tags=["Admin – Content: Audios"])
router.include_router(videos_router, prefix="/videos", tags=["Admin – Content: Videos"])
router.include_router(series_router, prefix="/series", tags=["Admin – Content: Series"])
router.include_router(live_streams_router, prefix="/live-streams", tags=["Admin – Content: Live Streams"])
router.include_router(ppv_router, prefix="/ppv", tags=["Admin – Content: PPV Events"])
router.include_router(rentals_router, prefix="/rentals", tags=["Admin – Content: Video Rentals"])
router.include_router(epg_router, prefix="/epg", tags=["Admin – Content: EPG"])
