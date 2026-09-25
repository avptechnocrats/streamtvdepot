from collections.abc import Iterable

from app.core.payment_gateways import get_active_payment_gateway_config

RENEWAL_GATEWAY_ORDER = ("stripe", "paypal", "razorpay", "cashfree")


def get_enabled_renewal_gateway_names(site_config: dict | None) -> Iterable[str]:
    """Yield active tenant gateways, with the configured default attempted first."""
    gateways = (site_config or {}).get("payment_gateways", {})
    if not isinstance(gateways, dict):
        return ()

    default_gateway = gateways.get("default_gateway")
    ordered_names = [default_gateway] if default_gateway in RENEWAL_GATEWAY_ORDER else []
    ordered_names.extend(name for name in RENEWAL_GATEWAY_ORDER if name not in ordered_names)

    return tuple(
        name
        for name in ordered_names
        if get_active_payment_gateway_config(site_config, name).get("enabled", False)
    )