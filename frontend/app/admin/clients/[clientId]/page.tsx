"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, Globe, Mail, Phone, Building2, CalendarDays,
    Ban, ShieldCheck, Trash2, RefreshCw, Loader2,
    AlertTriangle, ExternalLink, Clock,
    CreditCard, ReceiptText, History, Smartphone, Activity,
} from "lucide-react";
import {
    getClient, listPlans, getClientSubscription, updateClient, deleteClient, listClientBillingRecords,
    type ClientOut, type ClientSubscriptionOut, type ClientStatus, type PlanOut, type SaasBillingOut,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtMoney(amount: number | null | undefined, currency = "USD") {
    if (amount == null || isNaN(amount)) return "—";
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
            <div className="mt-1 text-sm text-foreground">{children}</div>
        </div>
    );
}

function StatusBadge({ status, isActive }: { status: string; isActive: boolean }) {
    const map: Record<string, string> = {
        active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        trial: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        inactive: "bg-muted text-muted-foreground border-border",
        suspended: "bg-red-500/10 text-red-400 border-red-500/20",
        expired: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    };
    const resolvedStatus = !isActive && status !== "suspended" ? "suspended" : status;
    const cls = map[resolvedStatus?.toLowerCase()] ?? map.inactive;
    return (
        <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
            {resolvedStatus.charAt(0).toUpperCase() + resolvedStatus.slice(1)}
        </span>
    );
}

function ConfirmDialog({
    title, detail, confirmLabel, destructive, onConfirm, onCancel,
}: {
    title: string; detail: string; confirmLabel: string; destructive?: boolean;
    onConfirm: () => void; onCancel: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
                <h2 className="text-base font-semibold text-foreground">{title}</h2>
                <p className="text-sm text-muted-foreground">{detail}</p>
                <div className="flex gap-3 justify-end">
                    <button onClick={onCancel}
                        className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
                        Cancel
                    </button>
                    <button onClick={onConfirm}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${destructive ? "bg-red-600 hover:bg-red-500" : "bg-primary hover:brightness-110"}`}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

type TabKey = "details" | "subscription" | "billing" | "payments";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "details",      label: "Profile",         icon: Building2 },
    { key: "subscription", label: "Subscription",    icon: ShieldCheck },
    { key: "billing",      label: "Billing History", icon: ReceiptText },
    { key: "payments",     label: "Payments",        icon: CreditCard },
];

export default function ClientDetailPage() {
    const { clientId } = useParams<{ clientId: string }>();
    const router = useRouter();
    const { toast } = useToast();

    const [tab, setTab]           = useState<TabKey>("details");
    const [client, setClient]     = useState<ClientOut | null>(null);
    const [subscription, setSub]  = useState<ClientSubscriptionOut | null>(null);
    const [plans, setPlans]       = useState<PlanOut[]>([]);
    const [billing, setBilling]   = useState<SaasBillingOut[]>([]);
    const [loading, setLoading]   = useState(true);
    const [billingLoading, setBL] = useState(false);
    const [error, setError]       = useState<string | null>(null);
    const [actionBusy, setBusy]   = useState<string | null>(null);
    const [confirm, setConfirm]   = useState<"suspend" | "reinstate" | "delete" | null>(null);

    const planById = useMemo(() => Object.fromEntries(plans.map((p) => [p.id, p])), [plans]);
    const isSuspended = client?.status === "suspended";

    const reinstateStatus = useMemo<ClientStatus>(() => {
        if (!subscription) return "inactive";
        const expired = subscription.expires_at && new Date(subscription.expires_at).getTime() < Date.now();
        if (subscription.status === "trial") return "trial";
        if (subscription.status === "active" && !expired) return "active";
        return "inactive";
    }, [subscription]);

    const load = useCallback(async () => {
        if (!clientId) return;
        setLoading(true);
        setError(null);
        try {
            const [c, pl, sub] = await Promise.all([
                getClient(clientId), listPlans(), getClientSubscription(clientId),
            ]);
            setClient(c); setPlans(pl); setSub(sub);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load client");
        } finally { setLoading(false); }
    }, [clientId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (tab !== "billing" || !clientId || billing.length) return;
        setBL(true);
        listClientBillingRecords(clientId, { page_size: 50 })
            .then(setBilling).catch(() => setBilling([]))
            .finally(() => setBL(false));
    }, [tab, clientId, billing.length]);

    async function runAction(action: "suspend" | "reinstate" | "delete") {
        if (!clientId) return;
        setBusy(action);
        setConfirm(null);
        try {
            if (action === "delete") {
                await deleteClient(clientId);
                toast({ description: "Client deleted.", duration: 3000 });
                router.push("/admin/clients");
                return;
            }
            const updated = await updateClient(clientId,
                action === "suspend"
                    ? { status: "suspended", is_active: false }
                    : { status: reinstateStatus, is_active: true },
            );
            setClient(updated);
            toast({ description: action === "suspend" ? "Client suspended." : "Client reinstated.", duration: 3000 });
        } catch (err) {
            toast({ description: err instanceof Error ? err.message : "Action failed", variant: "destructive", duration: 5000 });
        } finally { setBusy(null); }
    }

    const previewUrl = client ? `https://${client.slug}.preview.signalview.tech` : "";

    // ── Tab panes ─────────────────────────────────────────────────────────────

    function DetailsPane() {
        if (!client) return null;
        return (
            <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">General Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
                    <Field label="Company Name">{client.name}</Field>
                    <Field label="Slug"><span className="font-mono text-xs">{client.slug}</span></Field>
                    <Field label="Status"><StatusBadge status={client.status} isActive={client.is_active} /></Field>
                    <Field label="Email"><span className="flex items-center gap-1.5"><Mail size={13} />{client.email}</span></Field>
                    <Field label="Phone"><span className="flex items-center gap-1.5"><Phone size={13} />{client.phone || "—"}</span></Field>
                    <Field label="Country"><span className="flex items-center gap-1.5"><Building2 size={13} />{client.country || "—"}</span></Field>
                    <Field label="Domain"><span className="flex items-center gap-1.5"><Globe size={13} />{client.domain || "—"}</span></Field>
                    <Field label="Website">
                        {client.website
                            ? <a href={client.website} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline">
                                <ExternalLink size={12} />{client.website}
                              </a>
                            : "—"}
                    </Field>
                    <Field label="Timezone">{client.timezone || "—"}</Field>
                    <Field label="Joined"><span className="flex items-center gap-1.5"><CalendarDays size={13} />{fmt(client.created_at)}</span></Field>
                    <Field label="Last Updated">{fmt(client.updated_at)}</Field>
                    <Field label="Preview">
                        <a href={previewUrl} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline text-xs">
                            <ExternalLink size={12} />{previewUrl}
                        </a>
                    </Field>
                </div>
            </section>
        );
    }

    function SubscriptionPane() {
        if (!subscription) return <p className="text-sm text-muted-foreground">No subscription record found.</p>;
        const plan = planById[subscription.plan_id];
        const expired = subscription.expires_at && new Date(subscription.expires_at).getTime() < Date.now();
        const statusCls = subscription.status === "active"
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            : subscription.status === "trial"
            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
            : "bg-amber-500/10 text-amber-400 border-amber-500/20";
        return (
            <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">Current Subscription</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
                    <Field label="Plan">{plan?.name ?? subscription.plan_id}</Field>
                    <Field label="Status">
                        <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusCls}`}>
                            {subscription.status}
                        </span>
                    </Field>
                    <Field label="Auto-renew">{subscription.auto_renew ? "Yes" : "No"}</Field>
                    <Field label="Started">{fmt(subscription.started_at)}</Field>
                    <Field label="Expires">
                        <span className={`flex items-center gap-1 ${expired ? "text-red-400" : ""}`}>
                            {expired && <Clock size={12} />}{fmt(subscription.expires_at)}{expired ? " (expired)" : ""}
                        </span>
                    </Field>
                    {plan && <>
                        <Field label="Monthly Price">{fmtMoney(plan.price_monthly, plan.currency)}</Field>
                        <Field label="Max Users">{plan.max_users ?? "Unlimited"}</Field>
                        <Field label="Storage">{plan.max_storage_gb ? `${plan.max_storage_gb} GB` : "Unlimited"}</Field>
                        <Field label="Max Streams">{plan.max_streams ?? "Unlimited"}</Field>
                    </>}
                </div>
            </section>
        );
    }

    function BillingPane() {
        if (billingLoading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>;
        if (!billing.length) return <p className="text-sm text-muted-foreground">No billing records found.</p>;
        const hdrs = ["Invoice #", "Period", "Status", "Subtotal", "Total Due", "Paid At"];
        return (
            <section className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="grid grid-cols-6 gap-3 px-4 py-2.5 border-b border-border bg-muted/30">
                    {hdrs.map((h) => <p key={h} className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{h}</p>)}
                </div>
                {billing.map((b) => {
                    const statusColors: Record<string, string> = {
                        paid: "text-emerald-500",
                        pending: "text-amber-500",
                        failed: "text-red-500",
                        refunded: "text-blue-500",
                        cancelled: "text-muted-foreground",
                    };
                    const statusColor = statusColors[b.status] || "text-muted-foreground";
                    return (
                        <div key={b.id} className="grid grid-cols-6 gap-3 px-4 py-3 border-b border-border last:border-0">
                            <p className="text-xs font-mono text-foreground">{b.invoice_number || "—"}</p>
                            <p className="text-xs text-foreground">{b.period_year && b.period_month ? `${b.period_year}-${String(b.period_month).padStart(2, "0")}` : "—"}</p>
                            <p className={`text-xs capitalize font-medium ${statusColor}`}>{b.status || "—"}</p>
                            <p className="text-xs text-foreground">{fmtMoney(b.subtotal, b.currency || "USD")}</p>
                            <p className="text-xs text-foreground font-medium">{fmtMoney(b.total_due, b.currency || "USD")}</p>
                            <p className="text-xs text-muted-foreground">{fmt(b.paid_at)}</p>
                        </div>
                    );
                })}
            </section>
        );
    }

    function PlaceholderPane({ label }: { label: string }) {
        return (
            <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center space-y-2">
                <History size={28} className="mx-auto text-muted-foreground/30" />
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">Coming soon — this section will be available in a future update.</p>
            </div>
        );
    }

    // ── Full render ────────────────────────────────────────────────────────────

    return (
        <div className="p-6 space-y-6">
            {confirm && (
                <ConfirmDialog
                    title={confirm === "delete" ? "Delete client?" : confirm === "suspend" ? "Suspend client?" : "Reinstate client?"}
                    detail={
                        confirm === "delete"
                            ? `This permanently deletes ${client?.name ?? "this client"} and all associated data. This cannot be undone.`
                            : confirm === "suspend"
                            ? "The client will lose access immediately. You can reinstate them at any time."
                            : `Restore access and set status back to "${reinstateStatus}".`
                    }
                    confirmLabel={confirm === "delete" ? "Delete" : confirm === "suspend" ? "Suspend" : "Reinstate"}
                    destructive={confirm === "delete" || confirm === "suspend"}
                    onConfirm={() => runAction(confirm)}
                    onCancel={() => setConfirm(null)}
                />
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <button onClick={() => router.push("/admin/clients")}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0">
                        <ArrowLeft size={13} /> Clients
                    </button>
                    {client && (<>
                        <span className="text-muted-foreground/40 text-sm">/</span>
                        <h1 className="text-xl font-bold text-foreground truncate">{client.name}</h1>
                        <StatusBadge status={client.status} isActive={client.is_active} />
                    </>)}
                </div>

                {client && (
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={load} disabled={loading} title="Refresh"
                            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                        </button>
                        {isSuspended ? (
                            <button onClick={() => setConfirm("reinstate")} disabled={actionBusy !== null}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                                <ShieldCheck size={13} />
                                {actionBusy === "reinstate" && <Loader2 size={11} className="animate-spin" />}
                                Reinstate
                            </button>
                        ) : (
                            <button onClick={() => setConfirm("suspend")} disabled={actionBusy !== null}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 disabled:opacity-50 transition-colors">
                                <Ban size={13} />
                                {actionBusy === "suspend" && <Loader2 size={11} className="animate-spin" />}
                                Suspend
                            </button>
                        )}
                        <button onClick={() => setConfirm("delete")} disabled={actionBusy !== null}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 disabled:opacity-50 transition-colors">
                            <Trash2 size={13} />
                            {actionBusy === "delete" && <Loader2 size={11} className="animate-spin" />}
                            Delete
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {loading ? (
                <div className="rounded-2xl border border-border bg-card p-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 size={16} className="animate-spin" /> Loading client…
                </div>
            ) : client && (<>
                {/* Quick stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { label: "Status",  value: <StatusBadge status={client.status} isActive={client.is_active} /> },
                        { label: "Plan",    value: subscription ? (planById[subscription.plan_id]?.name ?? "—") : "None" },
                        { label: "Expires", value: fmt(subscription?.expires_at) },
                        { label: "Joined",  value: fmt(client.created_at) },
                    ].map(({ label, value }) => (
                        <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
                            <div className="mt-1 text-sm text-foreground">{value}</div>
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap gap-1 rounded-xl bg-secondary border border-border p-1 w-fit">
                    {TABS.map(({ key, label, icon: Icon }) => (
                        <button key={key} onClick={() => setTab(key)}
                            className={`inline-flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-medium transition-colors ${
                                tab === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                            }`}>
                            <Icon size={12} /> {label}
                        </button>
                    ))}
                </div>

                {tab === "details"      && <DetailsPane />}
                {tab === "subscription" && <SubscriptionPane />}
                {tab === "billing"      && <BillingPane />}
                {tab === "payments"     && <PlaceholderPane label="Payment History" />}
            </>)}
        </div>
    );
}
