"use client";

import { useCallback, useEffect, useState } from "react";
import {
    Check,
    Copy,
    CreditCard,
    Eye,
    EyeOff,
    ExternalLink,
    Info,
    Loader2,
    Pencil,
    X,
} from "lucide-react";
import { LabeledSwitch } from "@/components/ui/labeled-switch";
import { Switch } from "@/components/ui/switch";
import { getClientSlugFromAccessToken } from "@/lib/admin-auth";
import {
    fetchPaymentGateways,
    savePaymentGateways,
    type PaymentGatewaysOut,
} from "@/lib/api/services/payment-gateways";
import { TOKEN_KEYS } from "@/lib/api";

type Provider = "cashfree" | "razorpay" | "stripe" | "paypal";
type Mode = "test" | "live" | "sandbox";

const providers: {
    id: Provider;
    label: string;
    description: string;
    modeLabels: [string, string];
}[] = [
    {
        id: "cashfree",
        label: "Cashfree",
        description: "Accept payments via Cashfree Payments",
        modeLabels: ["Test / Sandbox", "Live"],
    },
    {
        id: "razorpay",
        label: "Razorpay",
        description: "Accept payments via Razorpay Checkout",
        modeLabels: ["Test / Sandbox", "Live"],
    },
    {
        id: "stripe",
        label: "Stripe",
        description: "Accept cards and local payment methods via Stripe",
        modeLabels: ["Test / Sandbox", "Live"],
    },
    {
        id: "paypal",
        label: "PayPal",
        description: "Accept payments via PayPal Checkout",
        modeLabels: ["Sandbox", "Live"],
    },
];

const fieldConfig: Record<
    Provider,
    { key: string; label: string; placeholder: string; secret?: boolean }[]
> = {
    cashfree: [
        {
            key: "app_id",
            label: "App ID",
            placeholder: "Enter Cashfree app ID",
        },
        {
            key: "app_secret",
            label: "App Secret",
            placeholder: "Enter app secret",
            secret: true,
        },
    ],
    razorpay: [
        { key: "key_id", label: "Key ID", placeholder: "rzp_test_…" },
        {
            key: "key_secret",
            label: "Key Secret",
            placeholder: "Enter key secret",
            secret: true,
        },
        {
            key: "webhook_secret",
            label: "Webhook Secret",
            placeholder: "Enter webhook secret",
            secret: true,
        },
    ],
    stripe: [
        {
            key: "publishable_key",
            label: "Publishable Key",
            placeholder: "pk_test_…",
        },
        {
            key: "secret_key",
            label: "Secret Key",
            placeholder: "sk_test_…",
            secret: true,
        },
        {
            key: "webhook_secret",
            label: "Webhook Secret",
            placeholder: "whsec_…",
            secret: true,
        },
    ],
    paypal: [
        { key: "client_id", label: "Client ID", placeholder: "AaBbCcDd…" },
        {
            key: "client_secret",
            label: "Client Secret",
            placeholder: "Enter client secret",
            secret: true,
        },
    ],
};

const emptyData = {
    default_gateway: null,
    cashfree: {},
    razorpay: {},
    stripe: {},
    paypal: {},
} as unknown as PaymentGatewaysOut;
const inputClass =
    "h-9 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary";
type Toast = { message: string; error?: boolean };

function useClientSlug(): string {
    const [slug, setSlug] = useState("");

    useEffect(() => {
        const token = localStorage.getItem(TOKEN_KEYS.access);
        if (token) {
            setSlug(getClientSlugFromAccessToken(token) ?? "");
        }
    }, []);

    return slug;
}

function webhookBase(): string {
    const api = process.env.NEXT_PUBLIC_API_URL ?? "";
    return api.replace(/\/api\/v\d+\/?$/, "");
}

function WebhookUrlBox({ provider, slug }: { provider: Provider; slug: string }) {
    const [copied, setCopied] = useState(false);
    const url = slug ? `${webhookBase()}/api/v1/webhooks/${provider}/${slug}` : "";
    const providerName = provider[0].toUpperCase() + provider.slice(1);
    const dashboardUrl = {
        stripe: "https://dashboard.stripe.com/webhooks/create",
        paypal: "https://developer.paypal.com/dashboard/webhooks",
        razorpay: "https://dashboard.razorpay.com/app/webhooks",
        cashfree: "https://www.cashfree.com/docs/api-reference/webhooks/overview",
    }[provider];

    const copy = () => {
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                    Webhook Endpoint URL
                </p>
                <a
                    href={dashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                >
                    Open {providerName} Dashboard
                    <ExternalLink size={11} />
                </a>
            </div>
            <p className="text-[11px] text-muted-foreground">
                Add this URL in your {providerName} dashboard, then configure the
                webhook signing secret below.
            </p>
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                <code className="flex-1 truncate select-all font-mono text-xs text-foreground">
                    {url || <span className="italic text-muted-foreground">Loading…</span>}
                </code>
                <button
                    type="button"
                    onClick={copy}
                    disabled={!url}
                    title="Copy URL"
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
                >
                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
            </div>
        </div>
    );
}

function SecretField({
    value,
    saved,
    placeholder,
    onChange,
}: {
    value: string;
    saved: boolean;
    placeholder: string;
    onChange: (value: string) => void;
}) {
    const [editing, setEditing] = useState(!saved);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        if (saved) {
            setEditing(false);
            setVisible(false);
        }
    }, [saved]);
    if (saved && !editing)
        return (
            <div className="space-y-1.5">
                <div className="flex h-9 items-center rounded-lg border border-border bg-secondary px-3 text-sm">
                    <span className="tracking-widest text-muted-foreground">
                        ••••••••••••
                    </span>
                    <span className="ml-auto text-[11px] text-emerald-400">
                        Saved
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                    <Pencil size={11} /> Edit
                </button>
            </div>
        );
    return (
        <div className="space-y-1.5">
            <div className="relative">
                <input
                    type={visible ? "text" : "password"}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    className={`${inputClass} pr-10`}
                />
                <button
                    type="button"
                    onClick={() => setVisible((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                    <span className="sr-only">Toggle secret visibility</span>
                    {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
            </div>
            {saved && (
                <button
                    type="button"
                    onClick={() => {
                        onChange("");
                        setEditing(false);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                    <X size={11} /> Cancel
                </button>
            )}
        </div>
    );
}

function GatewayForm({
    provider,
    data,
    onSaved,
    onToast,
}: {
    provider: Provider;
    data: PaymentGatewaysOut[Provider];
    onSaved: () => void;
    onToast: (toast: Toast) => void;
}) {
    const definition = providers.find((item) => item.id === provider)!;
    const clientSlug = useClientSlug();
    const initialMode = data.mode === "sandbox" ? "sandbox" : data.mode;
    const [enabled, setEnabled] = useState(data.enabled);
    const [defaultGateway, setDefaultGateway] = useState(data.is_default);
    const [mode, setMode] = useState<Mode>(initialMode);
    const [values, setValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const gatewayModes = data as unknown as Record<
        string,
        Record<string, unknown>
    >;
    const update = (modeKey: Mode, key: string, value: string) =>
        setValues((current) => ({ ...current, [`${modeKey}.${key}`]: value }));
    const save = async () => {
        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                enabled,
                is_default: defaultGateway,
                mode,
            };
            for (const modeKey of [testMode, "live"] as const) {
                const modePayload: Record<string, string | null> = {};
                for (const field of fieldConfig[provider]) {
                    const value = values[`${modeKey}.${field.key}`];
                    if (value !== undefined && (!field.secret || value !== "")) {
                        modePayload[field.key] = field.secret
                            ? value
                            : value.trim() || null;
                    }
                }
                payload[modeKey] = modePayload;
            }
            await savePaymentGateways({ [provider]: payload } as Parameters<
                typeof savePaymentGateways
            >[0]);
            onToast({ message: `${definition.label} settings saved.` });
            onSaved();
        } catch {
            onToast({
                message: `Failed to save ${definition.label} settings.`,
                error: true,
            });
        } finally {
            setSaving(false);
        }
    };
    const testMode = provider === "paypal" ? "sandbox" : "test";
    const renderModeSection = (modeKey: Mode, title: string) => {
        const modeData = gatewayModes[modeKey] ?? {};
        const isActive = mode === modeKey;
        return (
            <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-bold text-foreground">
                            {title} credentials
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Only one mode can be enabled at a time.
                        </p>
                    </div>
                    <Switch
                        checked={isActive}
                        onCheckedChange={() => setMode(modeKey)}
                        aria-label={
                            modeKey === "live"
                                ? "Enable Live Mode"
                                : "Enable Test Mode"
                        }
                    />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {fieldConfig[provider].map((field) => (
                        <div key={field.key} className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">
                                {field.label}
                            </label>
                            {field.secret ? (
                                <SecretField
                                    value={
                                        values[`${modeKey}.${field.key}`] ?? ""
                                    }
                                    saved={Boolean(
                                        modeData[`${field.key}_set`],
                                    )}
                                    placeholder={field.placeholder}
                                    onChange={(value) =>
                                        update(modeKey, field.key, value)
                                    }
                                />
                            ) : (
                                <input
                                    value={
                                        values[`${modeKey}.${field.key}`] ??
                                        String(modeData[field.key] ?? "")
                                    }
                                    onChange={(event) =>
                                        update(
                                            modeKey,
                                            field.key,
                                            event.target.value,
                                        )
                                    }
                                    placeholder={field.placeholder}
                                    className={inputClass}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };
    return (
        <section className="space-y-5 rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 font-bold text-primary">
                        {definition.label[0]}
                    </div>
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
                            {definition.label}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            {definition.description}
                        </p>
                    </div>
                </div>
                <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${enabled ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-border bg-muted text-muted-foreground"}`}
                >
                    {enabled ? "Enabled" : "Disabled"}
                </span>
            </div>
            <div className="border-t border-border" />
            <LabeledSwitch
                checked={enabled}
                onCheckedChange={setEnabled}
                label={`Enable ${definition.label} gateway`}
            />
            <LabeledSwitch
                checked={defaultGateway}
                onCheckedChange={setDefaultGateway}
                label="Make default"
                description="Use this gateway for new payments"
            />
            <WebhookUrlBox provider={provider} slug={clientSlug} />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {renderModeSection(testMode, definition.modeLabels[0])}
                {renderModeSection("live", "Live")}
            </div>
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                    {saving ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <Check size={14} />
                    )}
                    {saving ? "Saving…" : `Save ${definition.label}`}
                </button>
            </div>
        </section>
    );
}

export default function PaymentGatewaysPage() {
    const [data, setData] = useState<PaymentGatewaysOut>(emptyData);
    const [activeTab, setActiveTab] = useState<Provider>("cashfree");
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<Toast | null>(null);
    const load = useCallback(() => {
        setLoading(true);
        fetchPaymentGateways()
            .then(setData)
            .catch(() =>
                setToast({
                    message: "Failed to load gateway settings.",
                    error: true,
                }),
            )
            .finally(() => setLoading(false));
    }, []);
    useEffect(() => {
        load();
    }, [load]);
    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(null), 3500);
        return () => clearTimeout(timer);
    }, [toast]);
    return (
        <>
            <main className="max-w-6xl space-y-8 p-8">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                        <CreditCard size={18} className="text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-display font-700 text-foreground">
                            Payment Gateways
                        </h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Configure the provider, default route, and environment credentials used for payments.
                        </p>
                    </div>
                </div>
                {loading ? (
                    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                        <Loader2 size={16} className="animate-spin" /> Loading
                        gateway settings…
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
                            <Info size={20} className="shrink-0 text-primary" />
                            <span>
                                Only one payment gateway can be active for transactions
                            </span>
                        </div>
                        <div className="flex items-center gap-1 border-b border-border">
                            {providers.map((provider) => (
                                <button
                                    key={provider.id}
                                    type="button"
                                    onClick={() => setActiveTab(provider.id)}
                                    className={`relative shrink-0 px-4 py-2.5 text-sm font-semibold ${activeTab === provider.id ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                                >
                                    {provider.label}
                                    {data[provider.id].is_default && (
                                        <span className="ml-2 text-[10px] text-emerald-400">
                                            Default
                                        </span>
                                    )}
                                    {activeTab === provider.id && (
                                        <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
                                    )}
                                </button>
                            ))}
                        </div>
                        <GatewayForm
                            key={`${activeTab}-${data[activeTab].mode}-${data[activeTab].is_default}`}
                            provider={activeTab}
                            data={data[activeTab]}
                            onSaved={load}
                            onToast={setToast}
                        />
                    </div>
                )}
            </main>
            {toast && (
                <div
                    className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${toast.error ? "border-red-700/60 bg-red-950/90 text-red-300" : "border-emerald-700/60 bg-emerald-950/90 text-emerald-300"}`}
                >
                    {toast.error ? <X size={14} /> : <Check size={14} />}
                    {toast.message}
                </div>
            )}
        </>
    );
}
