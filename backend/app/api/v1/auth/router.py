from fastapi import APIRouter

from .register import router as register_router
from .superadmin import router as superadmin_auth_router
from .client import router as client_auth_router
from .user import router as user_auth_router
from .unified import router as unified_auth_router
from .watchlist import router as watchlist_router
from .checkout import router as checkout_router
from .user_subscriptions import router as user_subscriptions_router
from .user_tickets import router as user_tickets_router
from .user_transactions import router as user_transactions_router
from .notifications import router as notifications_router

router = APIRouter()

router.include_router(unified_auth_router, tags=["Auth – Unified Login"])
router.include_router(register_router, tags=["Auth – Registration"])
router.include_router(superadmin_auth_router, prefix="/superadmin", tags=["Auth – SuperAdmin"])
router.include_router(client_auth_router, tags=["Auth – Client Admin"])
router.include_router(user_auth_router, prefix="/user", tags=["Auth – End User"])
router.include_router(watchlist_router, prefix="/user/watchlist", tags=["End User – Watchlist"])
router.include_router(checkout_router, prefix="/user/checkout", tags=["End User – Checkout"])
router.include_router(user_subscriptions_router, prefix="/user/my-subscriptions", tags=["End User – Subscriptions"])
router.include_router(user_tickets_router, prefix="/user/tickets", tags=["End User – Support Tickets"])
router.include_router(user_transactions_router, prefix="/user/my-transactions", tags=["End User – Transactions"])
router.include_router(notifications_router, prefix="/user/notifications", tags=["End User – Notifications"])
