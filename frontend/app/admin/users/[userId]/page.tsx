"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, User2, AlertTriangle, Loader2,
    Eye, EyeOff, ShieldCheck, Ban, Trash2,
    CreditCard, History, Smartphone, Activity,
} from "lucide-react";
import {
    getUser, updateUser, deleteUser,
    listSubscriptions, listAdminPayments,
    type EndUserOut, type UserSubscriptionOut, type PaymentOut,
} from "@/lib/api";
import { StatusBadge } from "../../subscriptions/_components/SubscriptionRow";
import { useToast } from "@/hooks/use-toast";

function fmt(v: string | null | undefined) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function money(amount: number, currency: string) {
    return `${currency} ${Number(amount).toFixed(2)}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-sm text-foreground break-all">{children}</dd>
        </div>
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

type TabKey = "information" | "subscriptions" | "payments" | "activity" | "devices";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "information",  label: "Profile",             icon: User2 },
    { key: "subscriptions",label: "Subscription History",icon: ShieldCheck },
    { key: "payments",     label: "Payment History",     icon: CreditCard },
    { key: "activity",     label: "Login Activity",      icon: Activity },
    { key: "devices",      label: "Login Devices",       icon: Smartphone },
];

export default function UserDetailPage() {
    const { userId } = useParams<{ userId: string }>();
    const router = useRouter();
    const { toast } = useToast();

    const [user, setUser]             = useState<EndUserOut | null>(null);
    const [subscriptions, setSubs]    = useState<UserSubscriptionOut[]>([]);
    const [payments, setPayments]     = useState<PaymentOut[]>([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState<string | null>(null);
    const [tab, setTab]               = useState<TabKey>("information");
    const [showId, setShowId]         = useState(false);
    const [actionBusy, setBusy]       = useState<string | null>(null);
    const [confirm, setConfirm]       = useState<"disable" | "enable" | "delete" | null>(null);

    const load = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        setError(null);
        try {
            const [u, subs, pays] = await Promise.all([
                getUser(userId),
                listSubscriptions({ page_size: 100 }),
                listAdminPayments({ page_size: 100 }).catch(() => [] as PaymentOut[]),
            ]);
            setUser(u);
            setSubs(subs.filter((s) => s.user_id === userId));
            setPayments(pays.filter((p) => p.user_id === userId));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load user");
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    const sortedSubs = [...subscriptions].sort(
        (a, b) => new Date(b.started_at || b.created_at).getTime() - new Date(a.started_at || a.created_at).getTime(),
    );

    async function runAction(action: "disable" | "enable" | "delete") {
        if (!userId) return;
        setBusy(action);
        setConfirm(null);
        try {
            if (action === "delete") {
                await deleteUser(userId);
                toast({ description: "User deleted.", duration: 3000 });
                router.push("/admin/users");
                return;
            }
            const updated = await updateUser(userId, { is_active: action === "enable" });
            setUser(updated);
            toast({ description: action === "enable" ? "User enabled." : "User disabled.", duration: 3000 });
        } catch (err) {
            toast({ description: err instanceof Error ? err.message : "Action failed", variant: "destructive", duration: 5000 });
        } finally { setBusy(null); }
    }

    function PlaceholderPane({ label }: { label: string }) {
        return (
            <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center space-y-2">
                <History size={28} className="mx-auto text-muted-foreground/30" />
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">Coming soon — available in a future update.</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {confirm && (
                <ConfirmDialog
                    title={confirm === "delete" ? "Delete user?" : confirm === "disable" ? "Disable user?" : "Enable user?"}
                    detail={
                        confirm === "delete"
                            ? `This permanently deletes ${user?.full_name ?? "this user"} and all their data.`
                            : confirm === "disable"
                            ? "The user will not be able to sign in until re-enabled."
                            : "The user will regain access to sign in."
                    }
                    confirmLabel={confirm === "delete" ? "Delete" : confirm === "disable" ? "Disable" : "Enable"}
                    destructive={confirm !== "enable"}
                    onConfirm={() => runAction(confirm)}
                    onCancel={() => setConfirm(null)}
                />
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <button onClick={() => router.push("/admin/users")}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0">
                        <ArrowLeft size={13} /> Users
                    </button>
                    {user && (<>
                        <span className="text-muted-foreground/40 text-sm">/</span>
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-secondary border border-border shrink-0">
                                {user.avatar_url
                                    ? <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                                    : <div className="w-full h-full flex items-center justify-center text-muted-foreground/40"><User2 size={14} /></div>}
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-lg font-bold text-foreground leading-tight truncate">{user.full_name}</h1>
                                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                            </div>
                            <span className={`shrink-0 inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                user.is_active
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : "bg-red-500/10 text-red-400 border-red-500/20"
                            }`}>
                                {user.is_active ? "Active" : "Inactive"}
                            </span>
                        </div>
                    </>)}
                </div>

                {user && (
                    <div className="flex items-center gap-2 shrink-0">
                        {user.is_active ? (
                            <button onClick={() => setConfirm("disable")} disabled={actionBusy !== null}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 disabled:opacity-50 transition-colors">
                                <Ban size={13} />
                                {actionBusy === "disable" && <Loader2 size={11} className="animate-spin" />}
                                Disable
                            </button>
                        ) : (
                            <button onClick={() => setConfirm("enable")} disabled={actionBusy !== null}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                                <ShieldCheck size={13} />
                                {actionBusy === "enable" && <Loader2 size={11} className="animate-spin" />}
                                Enable
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
                    <Loader2 size={16} className="animate-spin" /> Loading user…
                </div>
            ) : user && (<>
                {/* Quick stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { label: "Status", value: user.is_active ? "Active" : "Inactive" },
                        { label: "Email verified", value: user.is_email_verified ? "Yes" : "No" },
                        { label: "Subscriptions", value: String(subscriptions.length) },
                        { label: "Joined", value: fmt(user.created_at) },
                    ].map(({ label, value }) => (
                        <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
                            <p className="mt-1 text-sm text-foreground">{value}</p>
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

                {/* ── Profile tab ────────────────────────────────────────────── */}
                {tab === "information" && (
                    <section className="rounded-2xl border border-border bg-card p-6">
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                            <Field label="Full Name">{user.full_name}</Field>
                            <Field label="Email">{user.email}</Field>
                            <Field label="Phone">{user.phone || "—"}</Field>
                            <Field label="Country">{user.country || "—"}</Field>
                            <Field label="Account Status">
                                <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                    user.is_active
                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                        : "bg-red-500/10 text-red-400 border-red-500/20"
                                }`}>{user.is_active ? "Active" : "Inactive"}</span>
                            </Field>
                            <Field label="Email Verified">{user.is_email_verified ? "Yes" : "No"}</Field>
                            <Field label="Registered On">{fmt(user.created_at)}</Field>
                            <div>
                                <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">User ID</dt>
                                <dd className="mt-1 flex items-center gap-2">
                                    <span className="text-sm font-mono text-foreground break-all">
                                        {showId ? userId : "•".repeat(24)}
                                    </span>
                                    <button type="button" onClick={() => setShowId((v) => !v)}
                                        aria-label={showId ? "Hide user ID" : "Reveal user ID"}
                                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                                        {showId ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </dd>
                            </div>
                        </dl>
                    </section>
                )}

                {/* ── Subscriptions tab ──────────────────────────────────────── */}
                {tab === "subscriptions" && (
                    <section className="rounded-2xl border border-border bg-card overflow-hidden">
                        <div className="grid grid-cols-[1fr_6rem_6rem_6rem] gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
                            {["Plan", "Status", "Started", "Expires"].map((h) => (
                                <p key={h} className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{h}</p>
                            ))}
                        </div>
                        {sortedSubs.length === 0 ? (
                            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No subscriptions found</p>
                        ) : sortedSubs.map((sub) => (
                            <div key={sub.id} className="grid grid-cols-[1fr_6rem_6rem_6rem] gap-4 px-4 py-3 border-b border-border last:border-0 items-center">
                                <div className="min-w-0">
                                    <p className="truncate text-sm text-foreground">{sub.plan_name || "—"}</p>
                                    {sub.plan_price != null && (
                                        <p className="text-[11px] text-muted-foreground">
                                            {money(sub.plan_price, sub.plan_currency || "USD")}
                                        </p>
                                    )}
                                </div>
                                <StatusBadge status={sub.status} />
                                <p className="text-xs text-muted-foreground">{fmt(sub.started_at)}</p>
                                <p className="text-xs text-muted-foreground">{sub.expires_at ? fmt(sub.expires_at) : "Never"}</p>
                            </div>
                        ))}
                    </section>
                )}

                {/* ── Payments tab ───────────────────────────────────────────── */}
                {tab === "payments" && (
                    <section className="rounded-2xl border border-border bg-card overflow-hidden">
                        <div className="grid grid-cols-[1fr_6rem_6rem_6rem] gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
                            {["Reference", "Amount", "Status", "Date"].map((h) => (
                                <p key={h} className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{h}</p>
                            ))}
                        </div>
                        {payments.length === 0 ? (
                            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No payments found</p>
                        ) : payments.map((p) => (
                            <div key={p.id} className="grid grid-cols-[1fr_6rem_6rem_6rem] gap-4 px-4 py-3 border-b border-border last:border-0 items-center">
                                <div className="min-w-0">
                                    <p className="truncate text-sm text-foreground capitalize">{p.reference_type || "Payment"}</p>
                                    <p className="truncate text-[11px] text-muted-foreground">
                                        {p.payment_method}{p.gateway_transaction_id ? ` · ${p.gateway_transaction_id}` : ""}
                                    </p>
                                </div>
                                <p className="text-xs text-foreground">{money(p.amount, p.currency)}</p>
                                <p className="text-xs text-muted-foreground">{p.status}</p>
                                <p className="text-xs text-muted-foreground">{fmt(p.paid_at || p.created_at)}</p>
                            </div>
                        ))}
                    </section>
                )}

                {tab === "activity" && <PlaceholderPane label="Login Activity" />}
                {tab === "devices"  && <PlaceholderPane label="Login Devices" />}
            </>)}
        </div>
    );
}
