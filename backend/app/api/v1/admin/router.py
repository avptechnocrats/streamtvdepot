from fastapi import APIRouter, Depends

from app.core.dependencies import enforce_admin_route_permission

from .advertisements import router as advertisements_router
from .contact_submissions import router as contact_submissions_router
from .billing import router as billing_router
from .content.router import router as content_router
from .coupons import router as coupons_router
from .dashboard import router as dashboard_router
from .payment_gateways import router as payment_gateways_router
from .payments import router as payments_router
from .site_settings import router as site_settings_router
from .subscriptions import router as subscriptions_router
from .theme_settings import router as theme_settings_router
from .taxes import router as taxes_router
from .transcoding import router as transcoding_router
from .upload import router as upload_router
from .users import router as users_router
from .tickets import router as tickets_router
from .support import router as support_router
from .pages import router as pages_router
from .menus import router as menus_router
from .roles import router as roles_router
from .content_partners import router as content_partners_router

router = APIRouter(dependencies=[Depends(enforce_admin_route_permission)])

router.include_router(dashboard_router, prefix="/dashboard", tags=["Admin – Dashboard"])
router.include_router(users_router, prefix="/users", tags=["Admin – Users"])
router.include_router(subscriptions_router, prefix="/subscriptions", tags=["Admin – Subscriptions"])
router.include_router(payments_router, prefix="/payments", tags=["Admin – Payments"])
router.include_router(billing_router, prefix="/billing", tags=["Admin – Billing"])
router.include_router(coupons_router, prefix="/coupons", tags=["Admin – Coupons"])
router.include_router(taxes_router, prefix="/taxes", tags=["Admin – Taxes"])
router.include_router(advertisements_router, prefix="/advertisements", tags=["Admin – Advertisements"])
router.include_router(content_router, prefix="/content", tags=["Admin – Content"])
router.include_router(upload_router, prefix="/upload", tags=["Admin – Upload"])
router.include_router(transcoding_router, prefix="/transcoding", tags=["Admin – Transcoding"])
router.include_router(theme_settings_router, prefix="/theme-settings", tags=["Admin – Theme Settings"])
router.include_router(site_settings_router, prefix="/site-settings", tags=["Admin – Site Settings"])
router.include_router(payment_gateways_router, prefix="/payment-gateways", tags=["Admin – Payment Gateways"])
router.include_router(tickets_router, prefix="/tickets", tags=["Admin – End User Tickets"])
router.include_router(support_router, prefix="/support", tags=["Admin – Help & Support"])
router.include_router(contact_submissions_router, prefix="/contact-submissions", tags=["Admin – Contact Submissions"])
router.include_router(pages_router, prefix="/pages", tags=["Admin – Pages"])
router.include_router(menus_router, prefix="/menus", tags=["Admin – Menus"])
router.include_router(roles_router, prefix="/roles", tags=["Admin – Roles & Access"])
router.include_router(content_partners_router, prefix="/content-partners", tags=["Admin – Content Partners"])
