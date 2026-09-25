"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, AlertTriangle, User as UserIcon, Eye, EyeOff } from "lucide-react";
import {
    getUser,
    listSubscriptions,
    listAdminPayments,
    type EndUserOut,
    type UserSubscriptionOut,
    type PaymentOut,
} from "@/lib/api";
import { StatusBadge } from "../_components/SubscriptionRow";

interface UserDetailPageProps {
    params: Promise<{ userId: string }>;
}

type TabKey = "information" | "subscriptions" | "payments";

const TABS: { key: TabKey; label: string }[] = [
    { key: "information", label: "User Information" },
    { key: "subscriptions", label: "Subscription History" },
    { key: "payments", label: "Payment History" },
];

function fmtDate(value: string | null | undefined) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function money(amount: number, currency: string) {
    return `${currency} ${Number(amount).toFixed(2)}`;
}

export default function UserSubscriptionDetailPage({ params }: UserDetailPageProps) {
    const [userId, setUserId] = useState("");
    const [user, setUser] = useState<EndUserOut | null>(null);
    const [subscriptions, setSubscriptions] = useState<UserSubscriptionOut[]>([]);
    const [payments, setPayments] = useState<PaymentOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<TabKey>("information");
    const [showUserId, setShowUserId] = useState(false);

    useEffect(() => {
        let cancelled = false;

        params.then(async ({ userId: id }) => {
            if (cancelled) return;
            setUserId(id);
            setLoading(true);
            setError(null);
            try {
                const [userRes, subsRes, paymentsRes] = await Promise.all([
                    getUser(id),
                    listSubscriptions({ page_size: 100 }),
                    listAdminPayments({ page_size: 100 }).catch(() => [] as PaymentOut[]),
                ]);
                if (cancelled) return;
                setUser(userRes);
                setSubscriptions(subsRes.filter((s) => s.user_id === id));
                setPayments(paymentsRes.filter((p) => p.user_id === id));
            } catch (err: unknown) {
                if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load user");
            } finally {
                if (!cancelled) setLoading(false);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [params]);

    const sortedSubscriptions = [...subscriptions].sort(
        (a, b) =>
            new Date(b.started_at || b.created_at).getTime() -
            new Date(a.started_at || a.created_at).getTime(),
    );

    return (
        <div className="p-6 space-y-6">
            <Link
                href="/admin/subscriptions"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
                <ChevronLeft size={14} /> Subscriptions
            </Link>

            <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <UserIcon size={18} />
                </div>
                <div className="min-w-0">
                    <h1 className="text-xl font-bold text-foreground truncate">
                        {loading ? "Loading…" : user?.full_name || user?.email || "User"}
                    </h1>
                    <p className="text-sm text-muted-foreground truncate">{user?.email ?? ""}</p>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            <div className="flex flex-wrap gap-1 rounded-xl bg-secondary border border-border p-1 w-fit">
                {TABS.map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`px-3 h-7 rounded-lg text-xs font-medium transition-colors ${tab === key
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                    Loading user details…
                </div>
            ) : tab === "information" ? (
                <section className="rounded-2xl border border-border bg-card p-6">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                        {[
                            ["Full name", user?.full_name || "—"],
                            ["Email", user?.email || "—"],
                            ["Phone", user?.phone || "—"],
                            ["Country", user?.country || "—"],
                            ["Account status", user?.is_active ? "Active" : "Inactive"],
                            ["Email verified", user?.is_email_verified ? "Yes" : "No"],
                            ["Registered on", fmtDate(user?.created_at)],
                        ].map(([label, value]) => (
                            <div key={label}>
                                <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                    {label}
                                </dt>
                                <dd className="mt-1 text-sm text-foreground break-all">{value}</dd>
                            </div>
                        ))}

                        <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                User ID
                            </dt>
                            <dd className="mt-1 flex items-center gap-2">
                                <span className="text-sm text-foreground break-all font-mono">
                                    {showUserId ? userId : "•".repeat(24)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShowUserId((v) => !v)}
                                    aria-label={showUserId ? "Hide user ID" : "Reveal user ID"}
                                    title={showUserId ? "Hide user ID" : "Reveal user ID"}
                                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showUserId ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </dd>
                        </div>
                    </dl>
                </section>
            ) : tab === "subscriptions" ? (
                <section className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
                        <p className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Plan</p>
                        <p className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Status</p>
                        <p className="hidden sm:block w-24 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Started</p>
                        <p className="hidden sm:block w-24 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Expires</p>
                    </div>
                    {sortedSubscriptions.length === 0 ? (
                        <p className="px-4 py-10 text-center text-sm text-muted-foreground">No subscriptions found</p>
                    ) : (
                        sortedSubscriptions.map((sub) => (
                            <div key={sub.id} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
                                <div className="flex-1 min-w-0">
                                    <p className="truncate text-sm text-foreground">{sub.plan_name || "—"}</p>
                                </div>
                                <div className="w-24 shrink-0">
                                    <StatusBadge status={sub.status} />
                                </div>
                                <p className="hidden sm:block w-24 shrink-0 text-xs text-muted-foreground">{fmtDate(sub.started_at)}</p>
                                <p className="hidden sm:block w-24 shrink-0 text-xs text-muted-foreground">
                                    {sub.expires_at ? fmtDate(sub.expires_at) : "Never"}
                                </p>
                            </div>
                        ))
                    )}
                </section>
            ) : (
                <section className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
                        <p className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Reference</p>
                        <p className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Amount</p>
                        <p className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Status</p>
                        <p className="hidden sm:block w-24 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Date</p>
                    </div>
                    {payments.length === 0 ? (
                        <p className="px-4 py-10 text-center text-sm text-muted-foreground">No payments found</p>
                    ) : (
                        payments.map((payment) => (
                            <div key={payment.id} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
                                <div className="flex-1 min-w-0">
                                    <p className="truncate text-sm text-foreground capitalize">
                                        {payment.reference_type || "Payment"}
                                    </p>
                                    <p className="truncate text-[11px] text-muted-foreground">
                                        {payment.payment_method}
                                        {payment.gateway_transaction_id ? ` · ${payment.gateway_transaction_id}` : ""}
                                    </p>
                                </div>
                                <p className="w-24 shrink-0 text-xs text-foreground">{money(payment.amount, payment.currency)}</p>
                                <p className="w-24 shrink-0 text-xs text-muted-foreground">{payment.status}</p>
                                <p className="hidden sm:block w-24 shrink-0 text-xs text-muted-foreground">
                                    {fmtDate(payment.paid_at || payment.created_at)}
                                </p>
                            </div>
                        ))
                    )}
                </section>
            )}
        </div>
    );
}
