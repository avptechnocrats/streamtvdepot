import Link from "next/link";
import { BadgeCheck, Clock, XCircle, PauseCircle } from "lucide-react";
import type { UserSubscriptionOut, SubscriptionStatus } from "@/lib/api";
import { formatLocalDateTime } from "@/lib/utils";

function StatusBadge({ status }: { status: SubscriptionStatus }) {
    const config: Record<SubscriptionStatus, { label: string; className: string; Icon: typeof BadgeCheck }> = {
        active: { label: "Active", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", Icon: BadgeCheck },
        trial: { label: "Trial", className: "bg-blue-500/10 text-blue-400 border-blue-500/20", Icon: BadgeCheck },
        expired: { label: "Expired", className: "bg-amber-500/10 text-amber-400 border-amber-500/20", Icon: Clock },
        cancelled: { label: "Cancelled", className: "bg-red-500/10 text-red-400 border-red-500/20", Icon: XCircle },
        paused: { label: "Paused", className: "bg-muted text-muted-foreground border-border", Icon: PauseCircle },
    };
    const { label, className, Icon } = config[status] ?? config.expired;
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${className}`}>
            <Icon size={10} />
            {label}
        </span>
    );
}

export interface SubscriptionRowProps {
    subscription: UserSubscriptionOut;
}

export function SubscriptionRow({ subscription }: SubscriptionRowProps) {
    const startDate = formatLocalDateTime(subscription.started_at);
    const expiryDate = subscription.expires_at
        ? formatLocalDateTime(subscription.expires_at)
        : "Never";

    return (
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
            {/* User */}
            <div className="flex-1 min-w-0">
                <Link
                    href={`/admin/subscriptions/${subscription.user_id}`}
                    className="block truncate text-sm font-medium text-primary hover:underline"
                >
                    {subscription.user_name || subscription.user_email || "Unknown user"}
                </Link>
                {subscription.user_email && (
                    <p className="truncate text-[11px] text-muted-foreground">{subscription.user_email}</p>
                )}
            </div>

            {/* Plan */}
            <p className="hidden sm:block w-40 shrink-0 truncate text-xs text-foreground">
                {subscription.plan_name || "—"}
            </p>

            {/* Status */}
            <div className="w-24 shrink-0">
                <StatusBadge status={subscription.status} />
            </div>

            {/* Auto-renew */}
            <div className="hidden md:block w-24 shrink-0">
                <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full ${subscription.auto_renew
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "bg-muted text-muted-foreground border border-border"
                    }`}>
                    {subscription.auto_renew ? "Auto-renew" : "Manual"}
                </span>
            </div>

            {/* Start date */}
            <p className="hidden sm:block text-xs text-muted-foreground w-24 shrink-0">{startDate}</p>

            {/* Expiry date */}
            <p className="hidden lg:block text-xs text-muted-foreground w-24 shrink-0">{expiryDate}</p>
        </div>
    );
}

export { StatusBadge };
