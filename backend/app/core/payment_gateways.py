"""Helpers for resolving tenant payment gateway configuration."""

from copy import deepcopy


def get_active_payment_gateway_credentials(gateway: dict) -> dict:
    """Return only the credentials for the gateway's configured active mode.

    New configurations store credentials in ``test``/``sandbox`` and ``live``
    sub-dicts. Legacy configurations store the active credentials flat on the
    gateway dict, so those values remain supported as a fallback.
    """
    active_mode = gateway.get("mode", "test")
    mode_credentials = gateway.get(active_mode)

    if not isinstance(mode_credentials, dict):
        return deepcopy({
            key: value
            for key, value in gateway.items()
            if key not in {"test", "sandbox", "live"}
        })

    resolved = {
        key: value
        for key, value in gateway.items()
        if key not in {"test", "sandbox", "live"}
    }
    resolved.update(deepcopy(mode_credentials))
    resolved["mode"] = active_mode
    return resolved


def get_active_payment_gateway_config(site_config: dict | None, provider: str) -> dict:
    """Return one provider's active-mode configuration from tenant settings."""
    gateways = (site_config or {}).get("payment_gateways", {})
    gateway = gateways.get(provider, {})
    if not isinstance(gateway, dict):
        return {}
    return get_active_payment_gateway_credentials(gateway)
