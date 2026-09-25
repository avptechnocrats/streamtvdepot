from fastapi import APIRouter

from .dashboard import router as dashboard_router
from .clients import router as clients_router
from .plans import router as plans_router
from .billing import router as billing_router
from .modules import router as modules_router
from .settings import router as settings_router
from .tickets import router as tickets_router
from .demo_bookings import router as demo_bookings_router
from .contact_submissions import router as contact_submissions_router
from .usage import router as usage_router
from .alerts import router as alerts_router
from .invoice import router as invoice_router
from .mail_logs import router as mail_logs_router
from .jobs import router as jobs_router
from .demo_content import router as demo_content_router
from .demo_categories import router as demo_categories_router

router = APIRouter()

router.include_router(dashboard_router, prefix="/dashboard", tags=["SuperAdmin – Dashboard"])
router.include_router(clients_router, prefix="/clients", tags=["SuperAdmin – Clients"])
router.include_router(plans_router, prefix="/plans", tags=["SuperAdmin – SaaS Plans"])
router.include_router(billing_router, prefix="/billing", tags=["SuperAdmin – Billing"])
router.include_router(modules_router, prefix="/modules", tags=["SuperAdmin – Modules"])
router.include_router(settings_router, prefix="/settings", tags=["SuperAdmin – Settings"])
router.include_router(tickets_router, prefix="/tickets", tags=["SuperAdmin – Support Tickets"])
router.include_router(demo_bookings_router, prefix="/demo-bookings", tags=["SuperAdmin – Demo Bookings"])
router.include_router(contact_submissions_router, prefix="/contact-submissions", tags=["SuperAdmin – Contact Submissions"])
router.include_router(usage_router, prefix="/usage", tags=["SuperAdmin – Usage Tracking"])
router.include_router(alerts_router, prefix="/alerts", tags=["SuperAdmin – Alerts"])
router.include_router(invoice_router, prefix="/usage", tags=["SuperAdmin – Invoices"])
router.include_router(mail_logs_router, prefix="/mail-logs", tags=["SuperAdmin – Mail Logs"])
router.include_router(jobs_router, prefix="/jobs", tags=["SuperAdmin – Job Scheduler"])
router.include_router(demo_content_router,    prefix="/demo-content",    tags=["SuperAdmin – Demo Content"])
router.include_router(demo_categories_router, prefix="/demo-categories", tags=["SuperAdmin – Demo Categories"])
