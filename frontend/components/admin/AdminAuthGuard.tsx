"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { fetchBillingLicensing, type CurrentSaasPlan } from "@/lib/api";
import AdminSidebar from "./AdminSidebar";
import ClientAdminSidebar from "./ClientAdminSidebar";
import AdminTopbar from "./AdminTopbar";
import { formatLocalDateTime } from "@/lib/utils";

const LOGIN_PATH = "/login";

interface AdminAuthGuardProps {
    children: React.ReactNode;
    requireSuperAdmin?: boolean;
}

type BillingNoticeKind = "no_plan" | "past_due" | "grace_period" | "expired" | null;

function resolveBillingNotice(plan: CurrentSaasPlan | null): BillingNoticeKind {
    if (!plan) return "no_plan";
    const s = String(plan.status || "").toLowerCase();
    if (s === "trial" || s === "active") return null;
    if (s === "past_due") return "past_due";
    if (s === "grace_period") return "grace_period";
    if (s === "expired") return "expired";
    return null;
}

export default function AdminAuthGuard({ children, requireSuperAdmin = false }: AdminAuthGuardProps) {
    const { isAuthenticated, isLoading, role } = useAdminAuth();
    const router = useRouter();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [billingNotice, setBillingNotice] = useState<{ kind: BillingNoticeKind; plan: CurrentSaasPlan | null }>({ kind: null, plan: null });

    useEffect(() => {
        if (isLoading) return;
        if (!isAuthenticated) {
            router.replace(LOGIN_PATH);
            return;
        }
        if (requireSuperAdmin && role !== "superadmin") {
            router.replace("/admin");
        }
    }, [isAuthenticated, isLoading, router, requireSuperAdmin, role]);

    useEffect(() => {
        if (!isAuthenticated || role !== "clientAdmin") {
            setBillingNotice({ kind: null, plan: null });
            return;
        }

        let cancelled = false;

        const checkPlanStatus = async () => {
            try {
                const data = await fetchBillingLicensing();
                if (cancelled) return;
                const plan = data.current_plan ?? null;
                setBillingNotice({ kind: resolveBillingNotice(plan), plan });
            } catch {
                if (!cancelled) setBillingNotice({ kind: null, plan: null });
            }
        };

        void checkPlanStatus();
        return () => { cancelled = true; };
    }, [isAuthenticated, role]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) return null;
    if (requireSuperAdmin && role !== "superadmin") return null;

    const Sidebar = role === "clientAdmin" ? ClientAdminSidebar : AdminSidebar;
    const { kind: noticeKind, plan: noticePlan } = billingNotice;
    const showNotice = role === "clientAdmin" && noticeKind !== null;

    return (
        <div className="flex flex-col min-h-screen bg-background">
            <AdminTopbar onMenuClick={() => setSidebarOpen((v) => !v)} />
            <div className="flex flex-1">
                <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
                <main className="flex-1 min-w-0">
                    {showNotice && (
                        <BillingNoticeBanner
                            kind={noticeKind!}
                            plan={noticePlan}
                            onManage={() => router.push(
                                noticeKind === "past_due" || noticeKind === "grace_period"
                                    ? "/admin/billing-licensing?pay_overdue=1"
                                    : "/admin/billing-licensing",
                            )}
                        />
                    )}
                    {children}
                </main>
            </div>
        </div>
    );
}

interface BillingNoticeBannerProps {
    kind: BillingNoticeKind;
    plan: CurrentSaasPlan | null;
    onManage: () => void;
}

function BillingNoticeBanner({ kind, plan, onManage }: BillingNoticeBannerProps) {
    const isUrgent = kind === "past_due" || kind === "grace_period" || kind === "expired";

    const config: Record<NonNullable<BillingNoticeKind>, { icon: React.ReactNode; title: string; detail: string; cta: string }> = {
        no_plan: {
            icon: <AlertTriangle size={18} className="billing-icon shrink-0 mt-0.5" />,
            title: "No active subscription",
            detail: "Purchase a plan to unlock all features.",
            cta: "Choose Plan",
        },
        past_due: {
            icon: <AlertTriangle size={18} className="billing-icon shrink-0 mt-0.5" />,
            title: "Payment overdue",
            detail: plan?.grace_period_ends_at
                ? `Your access continues until ${formatLocalDateTime(plan.grace_period_ends_at)}. Pay the outstanding invoice before then to avoid suspension.`
                : "Your access continues during the grace period. Pay now to avoid service interruption.",
            cta: "Pay Now",
        },
        grace_period: {
            icon: <Clock size={18} className="billing-icon shrink-0 mt-0.5" />,
            title: "Subscription expired — grace period active",
            detail: plan?.grace_period_ends_at
                ? `Your access continues until ${formatLocalDateTime(plan.grace_period_ends_at)}. Pay the outstanding invoice before then to avoid suspension.`
                : "Your access continues during the grace period. Renew now to maintain access.",
            cta: "Renew Now",
        },
        expired: {
            icon: <AlertTriangle size={18} className="billing-icon shrink-0 mt-0.5" />,
            title: plan?.is_trial ? "Trial ended" : "Subscription expired",
            detail: plan?.is_trial
                ? `Your ${plan.name} ended${plan.service_period_ends_at ? ` on ${formatLocalDateTime(plan.service_period_ends_at)}` : ""}. Choose a paid plan to continue.`
                : `Your ${plan?.name || "subscription"} ended${plan?.service_period_ends_at ? ` on ${formatLocalDateTime(plan.service_period_ends_at)}` : ""}. Choose a plan to restore access.`,
            cta: "Choose Plan",
        },
    };

    const c = config[kind!];
    if (!c) return null;

    const bannerClass = isUrgent ? "billing-banner-urgent" : "billing-banner-warning";
    const containerCls = `mx-5 mt-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 shadow-sm ${bannerClass}`;
    const btnCls = "billing-banner-btn shrink-0 rounded px-3 py-1.5 text-[12px] font-semibold transition-colors";

    return (
        <div className={containerCls}>
            <div className="flex items-start gap-2">
                {c.icon}
                <div>
                    <p className="text-xs font-semibold">{c.title}</p>
                    <p className="text-[12px] opacity-90 mt-0.5">{c.detail}</p>
                </div>
            </div>
            <button onClick={onManage} className={btnCls}>{c.cta}</button>
        </div>
    );
}

