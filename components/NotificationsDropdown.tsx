"use client";

import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Trash2, Film, CreditCard, Clock, Tag, Megaphone, AlertCircle, Loader2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    fetchNotifications,
    fetchUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    type UserNotification,
    type NotificationType,
} from "@/lib/services/notifications";
import { useAuth } from "@/hooks/use-auth";

// ── Icon per notification type ────────────────────────────────────────────────

function NotifIcon({ type }: { type: NotificationType }) {
    const cls = "shrink-0 mt-0.5";
    switch (type) {
        case "new_content":          return <Film size={15} className={`${cls} text-primary`} />;
        case "subscription_renewal": return <CreditCard size={15} className={`${cls} text-green-500`} />;
        case "subscription_expiry":  return <AlertCircle size={15} className={`${cls} text-yellow-500`} />;
        case "rental_expiry":        return <Clock size={15} className={`${cls} text-orange-500`} />;
        case "payment_success":      return <CreditCard size={15} className={`${cls} text-green-500`} />;
        case "payment_failed":       return <AlertCircle size={15} className={`${cls} text-destructive`} />;
        case "promotional":          return <Tag size={15} className={`${cls} text-primary`} />;
        case "system":               return <Megaphone size={15} className={`${cls} text-muted-foreground`} />;
    }
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
}

// ── Single notification row ───────────────────────────────────────────────────

function NotifRow({
    notif,
    onRead,
    onDelete,
}: {
    notif: UserNotification;
    onRead: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const router = useRouter();

    function handleClick() {
        if (!notif.is_read) onRead(notif.id);
        if (notif.action_url) router.push(notif.action_url);
    }

    return (
        <div
            className={`group relative flex items-start gap-3 px-4 py-3 transition-colors ${
                notif.action_url ? "cursor-pointer hover:bg-surface-hover" : ""
            } ${!notif.is_read ? "bg-primary/5" : ""}`}
            onClick={notif.action_url ? handleClick : undefined}
        >
            {/* Unread dot */}
            {!notif.is_read && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
            )}

            <div className="ml-2 mt-0.5">
                <NotifIcon type={notif.type} />
            </div>

            {notif.image_url && (
                <img
                    src={notif.image_url}
                    alt=""
                    className="w-10 h-14 rounded object-cover shrink-0"
                />
            )}

            <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug ${notif.is_read ? "text-foreground" : "text-foreground font-medium"}`}>
                    {notif.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                <p className="text-[11px] text-muted-foreground/70 mt-1">{timeAgo(notif.created_at)}</p>
            </div>

            {/* Actions — visible on row hover */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {!notif.is_read && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onRead(notif.id); }}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                        title="Mark as read"
                    >
                        <CheckCheck size={13} />
                    </button>
                )}
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(notif.id); }}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Dismiss"
                >
                    <Trash2 size={13} />
                </button>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

interface NotificationsDropdownProps {
    scrolled: boolean;
}

export default function NotificationsDropdown({ scrolled }: NotificationsDropdownProps) {
    const { user } = useAuth();
    const qc = useQueryClient();

    const { data: unreadCount = 0 } = useQuery({
        queryKey: ["notifications-unread-count"],
        queryFn: fetchUnreadCount,
        enabled: !!user,
        // Poll every 60 seconds for new notifications
        refetchInterval: 60_000,
        staleTime: 30_000,
    });

    const { data: notifications = [], isLoading } = useQuery({
        queryKey: ["notifications"],
        queryFn: () => fetchNotifications({ page_size: 30 }),
        enabled: !!user,
        staleTime: 30_000,
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    };

    const readOneMutation = useMutation({
        mutationFn: markNotificationRead,
        onSuccess: invalidate,
    });

    const readAllMutation = useMutation({
        mutationFn: markAllNotificationsRead,
        onSuccess: invalidate,
    });

    const deleteMutation = useMutation({
        mutationFn: deleteNotification,
        onSuccess: invalidate,
    });

    const btnCls = `p-2 rounded-md transition-colors relative ${
        scrolled
            ? "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
            : "text-white/80 hover:text-white hover:bg-white/10"
    }`;

    // Notifications belong to authenticated user accounts only.
    if (!user) {
        return null;
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className={btnCls} aria-label="Notifications">
                    <Bell size={20} />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none">
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                    )}
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                        {unreadCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[11px] font-semibold">
                                {unreadCount} new
                            </span>
                        )}
                    </div>
                    {unreadCount > 0 && (
                        <button
                            onClick={() => readAllMutation.mutate()}
                            disabled={readAllMutation.isPending}
                            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                        >
                            <CheckCheck size={13} />
                            Mark all read
                        </button>
                    )}
                </div>

                <DropdownMenuSeparator className="m-0" />

                {/* Body */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 size={18} className="text-muted-foreground animate-spin" />
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                        <Bell size={28} className="text-muted-foreground/40 mb-2" />
                        <p className="text-sm text-muted-foreground">You&apos;re all caught up!</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">New alerts will appear here</p>
                    </div>
                ) : (
                    <ScrollArea className="max-h-[420px]">
                        <div className="divide-y divide-border/50">
                            {notifications.map((n) => (
                                <NotifRow
                                    key={n.id}
                                    notif={n}
                                    onRead={(id) => readOneMutation.mutate(id)}
                                    onDelete={(id) => deleteMutation.mutate(id)}
                                />
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
