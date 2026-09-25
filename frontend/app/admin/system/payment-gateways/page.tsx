"use client";

import { useCallback, useEffect, useState } from "react";
import {
    CreditCard,
    Eye,
    EyeOff,
    Loader2,
    Check,
    X,
    ChevronDown,
    Pencil,
    Copy,
    ExternalLink,
} from "lucide-react";
import {
    fetchSuperadminSettings,
    saveSuperadminSettings,
    type SuperadminSettingsOut,
} from "@/lib/api/services/superadmin";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { LabeledSwitch } from "@/components/ui/labeled-switch";

type ToastType = "success" | "error";
interface Toast { id: number; message: string; type: ToastType }
let toastId = 0;

function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const push = useCallback((message: string, type: ToastType = "success") => {
        const id = ++toastId;
        setToasts((current) => [...current, { id, message, type }]);
        setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3500);
    }, []);
    const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
    return { toasts, push, dismiss };
}

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end">
            {toasts.map((toast) => (
                <div key={toast.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium shadow-lg ${toast.type === "success" ? "bg-emerald-950/90 border-emerald-700/60 text-emerald-300" : "bg-red-950/90 border-red-700/60 text-red-300"}`}>
                    {toast.type === "success" ? <Check size={14} /> : <X size={14} />}
                    {toast.message}
                    <button type="button" onClick={() => onDismiss(toast.id)} className="ml-1 opacity-60 hover:opacity-100"><X size={12} /></button>
                </div>
            ))}
        </div>
    );
}

function SectionCard({ children }: { children: React.ReactNode }) {
    return <section className="rounded-xl border border-border bg-card p-6 space-y-5">{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <div className="space-y-1"><label className="block text-xs font-semibold text-muted-foreground">{label}</label>{children}</div>;
}

const inputCls = "w-full h-9 rounded-lg bg-secondary border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50";

const defaultRazorpay: SuperadminSettingsOut["payment_gateway"]["razorpay"] = {
    enabled: false,
    is_default: false,
    mode: "test",
    key_id: null,
    key_secret_set: false,
    webhook_secret_set: false,
};

const defaultCashfree: SuperadminSettingsOut["payment_gateway"]["cashfree"] = {
    enabled: false,
    is_default: false,
    mode: "test",
    app_id: null,
    app_secret_set: false,
};

function SecretInput({ value, onChange, placeholder, isSet }: { value: string; onChange: (value: string) => void; placeholder: string; isSet: boolean }) {
    const [editing, setEditing] = useState(!isSet);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (isSet) {
            setEditing(false);
            setVisible(false);
        }
    }, [isSet]);

    if (!isSet || editing) {
        return (
            <div className="space-y-1.5">
                <div className="relative">
                    <input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoFocus={isSet && editing} className={`${inputCls} pr-10`} />
                    <button type="button" tabIndex={-1} onClick={() => setVisible((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                </div>
                {isSet && <button type="button" onClick={() => { onChange(""); setEditing(false); setVisible(false); }} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><X size={11} /> Cancel</button>}
                {!isSet && <p className="text-xs text-muted-foreground">Ensure before saving</p>}
            </div>
        );
    }

    return (
        <div className="space-y-1.5">
            <div className="w-full h-9 rounded-lg bg-secondary border border-border px-3 text-sm flex items-center gap-2 select-none">
                <span className="text-muted-foreground tracking-widest text-base leading-none">••••••••••••</span>
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5"><Check size={10} /> Saved</span>
            </div>
            <button type="button" onClick={() => { setEditing(true); setVisible(false); }} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><Pencil size={11} /> Edit</button>
        </div>
    );
}

function ModeSelect({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
    return (
        <div className="relative">
            <select value={value} onChange={(event) => onChange(event.target.value)} className={`${inputCls} appearance-none pr-8 cursor-pointer`}>
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
    );
}

function PlatformWebhookUrl({ provider }: { provider: "stripe" | "paypal" | "razorpay" | "cashfree" }) {
    const [copied, setCopied] = useState(false);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
    const webhookBaseUrl = apiUrl.replace(/\/api\/v\d+\/?$/, "");
    const webhookUrl = `${webhookBaseUrl}/api/v1/webhooks/platform/${provider}`;
    const dashboardUrl = provider === "stripe"
        ? "https://dashboard.stripe.com/webhooks/create"
        : provider === "paypal"
            ? "https://developer.paypal.com/dashboard/webhooks"
            : provider === "razorpay"
                ? "https://dashboard.razorpay.com/app/webhooks"
                : "https://www.cashfree.com/docs/api-reference/webhooks/overview";
    const providerName = provider[0].toUpperCase() + provider.slice(1);
    const eventText = provider === "stripe"
        ? "checkout.session.completed"
        : provider === "paypal"
            ? "CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED"
            : provider === "razorpay"
                ? "payment.captured, order.paid"
                : "Payment success and refund events";

    const copy = () => {
        navigator.clipboard.writeText(webhookUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Platform Webhook Endpoint</p>
                <a href={dashboardUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0">Open {providerName} Dashboard <ExternalLink size={11} /></a>
            </div>
            <p className="text-[11px] text-muted-foreground">Add this URL to receive StreamTVDepot SaaS subscription payment events.</p>
            <div className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-2">
                <code className="flex-1 min-w-0 text-xs font-mono text-foreground truncate select-all">{webhookUrl}</code>
                <button type="button" onClick={copy} title="Copy URL" className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors">{copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}</button>
            </div>
            <p className="text-[11px] text-muted-foreground">Events: <span className={provider === "cashfree" ? "" : "font-mono"}>{eventText}</span></p>
        </div>
    );
}

function StripeCard({ data, onSaved, pushToast }: {
    data: SuperadminSettingsOut["payment_gateway"]["stripe"];
    onSaved: () => void;
    pushToast: (message: string, type?: ToastType) => void;
}) {
    const [enabled, setEnabled] = useState(data.enabled);
    const [mode, setMode] = useState(data.mode);
    const [publicKey, setPublicKey] = useState(data.publishable_key ?? "");
    const [secretKey, setSecretKey] = useState("");
    const [webhookSecret, setWebhookSecret] = useState("");
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveSuperadminSettings({ payment_gateway: { stripe: { enabled, is_default: enabled, mode, publishable_key: publicKey.trim() || null, ...(secretKey !== "" ? { secret_key: secretKey } : {}), ...(webhookSecret !== "" ? { webhook_secret: webhookSecret } : {}) } } });
            setSecretKey("");
            setWebhookSecret("");
            pushToast("Stripe settings saved.");
            onSaved();
        } catch {
            pushToast("Failed to save Stripe settings.", "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <SectionCard>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-[#635bff]/10 border border-[#635bff]/20"><span className="font-bold text-base leading-none select-none text-[#635bff]">S</span></div>
                    <div><p className="text-sm font-bold text-foreground uppercase tracking-wide">Stripe</p><p className="text-xs text-muted-foreground">Accept cards and local payment methods</p></div>
                </div>
                <div className="flex items-center gap-2"><span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${enabled ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-muted text-muted-foreground border border-border"}`}><span className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-emerald-400" : "bg-muted-foreground"}`} />{enabled ? "Enabled" : "Disabled"}</span>{data.is_default && <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Default</span>}</div>
            </div>
            <div className="border-t border-border" />
            <LabeledSwitch checked={enabled} onCheckedChange={setEnabled} label="Enable Stripe gateway" />
            <PlatformWebhookUrl provider="stripe" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Environment"><ModeSelect value={mode} onChange={(value) => setMode(value as "test" | "live")} options={[{ value: "test", label: "Test mode" }, { value: "live", label: "Live mode" }]} /></Field>
                <Field label="Publishable Key"><input type="text" value={publicKey} onChange={(event) => setPublicKey(event.target.value)} placeholder="pk_test_…" className={inputCls} /></Field>
                <Field label="Secret Key"><SecretInput value={secretKey} onChange={setSecretKey} placeholder="sk_test_…" isSet={data.secret_key_set} /></Field>
                <Field label="Webhook Secret"><SecretInput value={webhookSecret} onChange={setWebhookSecret} placeholder="whsec_…" isSet={data.webhook_secret_set} /></Field>
            </div>
            <div className="flex justify-end"><button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{saving ? "Saving…" : "Save Stripe"}</button></div>
        </SectionCard>
    );
}

function PaypalCard({ data, onSaved, pushToast }: {
    data: SuperadminSettingsOut["payment_gateway"]["paypal"];
    onSaved: () => void;
    pushToast: (message: string, type?: ToastType) => void;
}) {
    const [enabled, setEnabled] = useState(data.enabled);
    const [mode, setMode] = useState(data.mode);
    const [clientId, setClientId] = useState(data.client_id ?? "");
    const [clientSecret, setClientSecret] = useState("");
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveSuperadminSettings({ payment_gateway: { paypal: { enabled, is_default: enabled, mode, client_id: clientId.trim() || null, ...(clientSecret !== "" ? { client_secret: clientSecret } : {}) } } });
            setClientSecret("");
            pushToast("PayPal settings saved.");
            onSaved();
        } catch {
            pushToast("Failed to save PayPal settings.", "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <SectionCard>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-[#003087]/15 border border-[#003087]/20"><span className="font-bold text-base leading-none select-none text-[#009cde]">P</span></div>
                    <div><p className="text-sm font-bold text-foreground uppercase tracking-wide">PayPal</p><p className="text-xs text-muted-foreground">Accept payments via PayPal Checkout</p></div>
                </div>
                <div className="flex items-center gap-2"><span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${enabled ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-muted text-muted-foreground border border-border"}`}><span className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-emerald-400" : "bg-muted-foreground"}`} />{enabled ? "Enabled" : "Disabled"}</span>{data.is_default && <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Default</span>}</div>
            </div>
            <div className="border-t border-border" />
            <LabeledSwitch checked={enabled} onCheckedChange={setEnabled} label="Enable PayPal gateway" />
            <PlatformWebhookUrl provider="paypal" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Environment"><ModeSelect value={mode} onChange={(value) => setMode(value as "sandbox" | "live")} options={[{ value: "sandbox", label: "Sandbox (testing)" }, { value: "live", label: "Live (production)" }]} /></Field>
                <Field label="Client ID"><input type="text" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="AaBbCcDd…" className={inputCls} /></Field>
                <Field label="Client Secret"><SecretInput value={clientSecret} onChange={setClientSecret} placeholder="Enter client secret" isSet={data.client_secret_set} /></Field>
            </div>
            <div className="flex justify-end"><button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{saving ? "Saving…" : "Save PayPal"}</button></div>
        </SectionCard>
    );
}

function RazorpayCard({ data, onSaved, pushToast }: { 
    data: SuperadminSettingsOut["payment_gateway"]["razorpay"]; 
    onSaved: () => void; pushToast: (message: string, type?: ToastType) => void 
}) {
    const [enabled, setEnabled] = useState(data.enabled);
    const [mode, setMode] = useState(data.mode);
    const [keyId, setKeyId] = useState(data.key_id ?? "");
    const [keySecret, setKeySecret] = useState("");
    const [webhookSecret, setWebhookSecret] = useState("");
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveSuperadminSettings({ payment_gateway: { razorpay: { enabled, is_default: enabled, mode, key_id: keyId.trim() || null, ...(keySecret !== "" ? { key_secret: keySecret } : {}), ...(webhookSecret !== "" ? { webhook_secret: webhookSecret } : {}) } } });
            setKeySecret("");
            setWebhookSecret("");
            pushToast("Razorpay settings saved.");
            onSaved();
        } catch {
            pushToast("Failed to save Razorpay settings.", "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <SectionCard>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-[#3395ff]/10 border border-[#3395ff]/20 flex items-center justify-center shrink-0"><span className="text-[#3395ff] font-bold text-base leading-none select-none">R</span></div><div><p className="text-sm font-bold text-foreground uppercase tracking-wide">Razorpay</p><p className="text-xs text-muted-foreground">Accept payments via Razorpay Checkout</p></div></div>
                <div className="flex items-center gap-2"><span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${enabled ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-muted text-muted-foreground border border-border"}`}><span className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-emerald-400" : "bg-muted-foreground"}`} />{enabled ? "Enabled" : "Disabled"}</span>{data.is_default && <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Default</span>}</div>
            </div>
            <div className="border-t border-border" />
            <LabeledSwitch checked={enabled} onCheckedChange={setEnabled} label="Enable Razorpay gateway" />
            <PlatformWebhookUrl provider="razorpay" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Environment"><ModeSelect value={mode} onChange={(value) => setMode(value as "test" | "live")} options={[{ value: "test", label: "Test mode" }, { value: "live", label: "Live mode" }]} /></Field>
                <Field label="Key ID"><input type="text" value={keyId} onChange={(event) => setKeyId(event.target.value)} placeholder="rzp_test_…" className={inputCls} /></Field>
                <Field label="Key Secret"><SecretInput value={keySecret} onChange={setKeySecret} placeholder="Enter key secret" isSet={data.key_secret_set} /></Field>
                <Field label="Webhook Secret"><SecretInput value={webhookSecret} onChange={setWebhookSecret} placeholder="Enter webhook secret" isSet={data.webhook_secret_set} /></Field>
            </div>
            <div className="flex justify-end"><button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{saving ? "Saving…" : "Save Razorpay"}</button></div>
        </SectionCard>
    );
}

function CashfreeCard({ data, onSaved, pushToast }: { 
    data: SuperadminSettingsOut["payment_gateway"]["cashfree"]; 
    onSaved: () => void; 
    pushToast: (message: string, type?: ToastType) => void 
}) {
    const [enabled, setEnabled] = useState(data.enabled);
    const [mode, setMode] = useState(data.mode);
    const [appId, setAppId] = useState(data.app_id ?? "");
    const [appSecret, setAppSecret] = useState("");
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveSuperadminSettings({ payment_gateway: { cashfree: { enabled, is_default: enabled, mode, app_id: appId.trim() || null, ...(appSecret !== "" ? { app_secret: appSecret } : {}) } } });
            setAppSecret("");
            pushToast("Cashfree settings saved.");
            onSaved();
        } catch {
            pushToast("Failed to save Cashfree settings.", "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <SectionCard>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-[#00b386]/10 border border-[#00b386]/20 flex items-center justify-center shrink-0"><span className="text-[#00b386] font-bold text-base leading-none select-none">C</span></div><div><p className="text-sm font-bold text-foreground uppercase tracking-wide">Cashfree</p><p className="text-xs text-muted-foreground">Accept payments via Cashfree Payments</p></div></div>
                <div className="flex items-center gap-2"><span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${enabled ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-muted text-muted-foreground border border-border"}`}><span className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-emerald-400" : "bg-muted-foreground"}`} />{enabled ? "Enabled" : "Disabled"}</span>{data.is_default && <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Default</span>}</div>
            </div>
            <div className="border-t border-border" />
            <LabeledSwitch checked={enabled} onCheckedChange={setEnabled} label="Enable Cashfree gateway" />
            <PlatformWebhookUrl provider="cashfree" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Environment"><ModeSelect value={mode} onChange={(value) => setMode(value as "test" | "live")} options={[{ value: "test", label: "Test mode" }, { value: "live", label: "Live mode" }]} /></Field>
                <Field label="App ID"><input type="text" value={appId} onChange={(event) => setAppId(event.target.value)} placeholder="Enter Cashfree app ID" className={inputCls} /></Field>
                <Field label="App Secret"><SecretInput value={appSecret} onChange={setAppSecret} placeholder="Enter app secret" isSet={data.app_secret_set} /></Field>
            </div>
            <div className="flex justify-end"><button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{saving ? "Saving…" : "Save Cashfree"}</button></div>
        </SectionCard>
    );
}

function SuperadminPaymentGatewayPage() {
    const [settings, setSettings] = useState<SuperadminSettingsOut["payment_gateway"] | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"stripe" | "paypal" | "razorpay" | "cashfree">("stripe");
    const { toasts, push: pushToast, dismiss } = useToast();

    const loadSettings = useCallback(() => {
        setLoading(true);
        fetchSuperadminSettings().then((data) => setSettings({
            ...data.payment_gateway,
            razorpay: data.payment_gateway.razorpay ?? defaultRazorpay,
            cashfree: data.payment_gateway.cashfree ?? defaultCashfree,
        })).catch(() => pushToast("Failed to load payment gateway settings.", "error")).finally(() => setLoading(false));
    }, [pushToast]);

    useEffect(() => { loadSettings(); }, [loadSettings]);

    return (
        <>
            <div className="p-6 md:p-8 space-y-6 max-w-6xl">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><CreditCard size={18} className="text-primary" /></div>
                    <div><h1 className="text-xl font-display font-bold text-foreground">Payment Gateways</h1><p className="text-sm text-muted-foreground mt-0.5">Configure payment providers used for StreamTVDepot platform billing.</p></div>
                </div>
                {loading || !settings ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 size={16} className="animate-spin" /> Loading payment gateway settings…</div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex items-center gap-1 border-b border-border">
                            {(["stripe", "paypal", "razorpay", "cashfree"] as const).map((tab) => (
                                <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`relative shrink-0 px-4 py-2.5 text-sm font-semibold capitalize transition-colors ${activeTab === tab ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                                    {tab === "paypal" ? "PayPal" : tab[0].toUpperCase() + tab.slice(1)}
                                    {activeTab === tab && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
                                </button>
                            ))}
                        </div>
                        {activeTab === "paypal" && <PaypalCard key="paypal" data={settings.paypal} onSaved={loadSettings} pushToast={pushToast} />}
                        {activeTab === "stripe" && <StripeCard key="stripe" data={settings.stripe} onSaved={loadSettings} pushToast={pushToast} />}
                        {activeTab === "razorpay" && <RazorpayCard key="razorpay" data={settings.razorpay} onSaved={loadSettings} pushToast={pushToast} />}
                        {activeTab === "cashfree" && <CashfreeCard key="cashfree" data={settings.cashfree} onSaved={loadSettings} pushToast={pushToast} />}
                    </div>
                )}
            </div>
            <ToastStack toasts={toasts} onDismiss={dismiss} />
        </>
    );
}

export default function PaymentGatewaysPage() {
    const { role } = useAdminAuth();
    if (role !== "superadmin") {
        return <div className="p-8 text-sm text-muted-foreground">This page is available to superadmins only.</div>;
    }
    return <SuperadminPaymentGatewayPage />;
}
