"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Film, RefreshCw, Ticket } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import Pagination from "@/components/Pagination";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { fetchMySubscriptions, type UserPurchase } from "@/lib/services/checkout";

const PAGE_SIZE = 10;

function formatDate(value: string | null): string {
    if (!value) return "Lifetime";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(date);
}

function formatDuration(purchase: UserPurchase): string {
    if (!purchase.expires_at) return "Lifetime access";
    const startedAt = new Date(purchase.started_at).getTime();
    const expiresAt = new Date(purchase.expires_at).getTime();
    if (Number.isNaN(startedAt) || Number.isNaN(expiresAt) || expiresAt <= startedAt) return "—";

    const totalHours = Math.round((expiresAt - startedAt) / (1000 * 60 * 60));
    if (totalHours < 24) return `${totalHours} hour${totalHours === 1 ? "" : "s"}`;
    const totalDays = Math.round(totalHours / 24);
    if (totalDays < 30) return `${totalDays} day${totalDays === 1 ? "" : "s"}`;
    const totalMonths = Math.round(totalDays / 30);
    return `${totalMonths} month${totalMonths === 1 ? "" : "s"}`;
}

function statusLabel(purchase: UserPurchase): string {
    if (purchase.status === "trial") return "Trial";
    if (purchase.status === "active") return "Active";
    if (purchase.status === "expired") return "Expired";
    if (purchase.status === "cancelled") return "Cancelled";
    return purchase.status.replaceAll("_", " ");
}

function statusClass(purchase: UserPurchase): string {
    if (purchase.status === "active" || purchase.status === "trial") {
        return "border-emerald-500/20 bg-emerald-500/10 text-emerald-500";
    }
    if (purchase.status === "expired") {
        return "border-red-500/20 bg-red-500/10 text-red-500";
    }
    return "border-amber-500/20 bg-amber-500/10 text-amber-500";
}

function RentalSkeleton() {
    return (
        <tr className="border-t border-border/50">
            <td className="px-4 py-4"><Skeleton className="h-4 w-40 rounded" /></td>
            <td className="px-4 py-4"><Skeleton className="h-4 w-20 rounded" /></td>
            <td className="px-4 py-4"><Skeleton className="h-4 w-28 rounded" /></td>
            <td className="px-4 py-4"><Skeleton className="h-4 w-24 rounded" /></td>
            <td className="px-4 py-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
        </tr>
    );
}

export default function RentalsClient() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const [rentals, setRentals] = useState<UserPurchase[]>([]);
    const [purchaseType, setPurchaseType] = useState<"rent" | "ppv">("rent");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);

    const loadRentals = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError("");
        try {
            const data = await fetchMySubscriptions(purchaseType, { page, page_size: PAGE_SIZE + 1 });
            setRentals(data.slice(0, PAGE_SIZE));
            setHasMore(data.length > PAGE_SIZE);
        } catch {
            setRentals([]);
            setError("Could not load rentals. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [user, page, purchaseType]);

    useEffect(() => {
        if (!authLoading && !user) router.replace("/login");
    }, [authLoading, user, router]);

    useEffect(() => {
        void loadRentals();
    }, [loadRentals]);

    if (authLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="mb-6 h-8 w-48 rounded" />
                <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
                    <table className="min-w-full text-sm">
                        <tbody>{Array.from({ length: 4 }).map((_, index) => <RentalSkeleton key={index} />)}</tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (!user) return null;

    const isPpv = purchaseType === "ppv";
    const purchaseLabel = isPpv ? "PPV purchases" : "rentals";

    function handlePurchaseTypeChange(value: string) {
        setPurchaseType(value as "rent" | "ppv");
        setPage(1);
    }

    return (
        <div>
            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-foreground">Rentals &amp; PPVs</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">Your purchased content and access validity</p>
                </div>
                <button
                    onClick={() => void loadRentals()}
                    disabled={loading}
                    className="flex px-3 py-1.5 gap-1.5 items-center text-xs rounded-lg border border-border bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                >
                    <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                    Refresh
                </button>
            </div>

            <Tabs value={purchaseType} onValueChange={handlePurchaseTypeChange} className="mb-5">
                <TabsList>
                    <TabsTrigger value="rent" className="gap-1.5"><Film size={14} className="text-primary" /> Rentals</TabsTrigger>
                    <TabsTrigger value="ppv" className="gap-1.5"><Ticket size={14} className="text-amber-500" /> PPV</TabsTrigger>
                </TabsList>
            </Tabs>

            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
                {error ? (
                    <div className="px-5 py-12 text-center text-sm text-destructive">{error}</div>
                ) : loading ? (
                    <div className="overflow-x-auto">
                        <table className="min-w-[760px] w-full text-sm">
                            <tbody>{Array.from({ length: 5 }).map((_, index) => <RentalSkeleton key={index} />)}</tbody>
                        </table>
                    </div>
                ) : rentals.length === 0 ? (
                    <div className="flex flex-col items-center gap-4 px-5 py-16 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                            <Film size={24} className="text-muted-foreground/50" />
                        </div>
                        <div className="space-y-1">
                            <p className="font-semibold text-foreground">No {purchaseLabel} yet</p>
                            <p className="max-w-xs text-sm text-muted-foreground">Your {purchaseLabel} will appear here after you complete a purchase.</p>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-[760px] w-full text-left text-sm">
                            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Content</th>
                                    <th className="px-4 py-3 font-semibold">Amount</th>
                                    <th className="px-4 py-3 font-semibold">Validity</th>
                                    <th className="px-4 py-3 font-semibold">Duration</th>
                                    <th className="px-4 py-3 font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rentals.map((rental) => (
                                    <tr key={rental.id} className="border-t border-border/50 align-top">
                                        <td className="px-4 py-4">
                                            {rental.content_detail_url ? (
                                                <Link href={rental.content_detail_url} className="group flex items-start gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                                    <RentalContent rental={rental} isPpv={isPpv} />
                                                </Link>
                                            ) : (
                                                <div className="flex items-start gap-3">
                                                    <RentalContent rental={rental} isPpv={isPpv} />
                                                </div>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 font-medium text-foreground">
                                            {rental.amount == null ? "—" : `${rental.currency || ""} ${rental.amount.toFixed(2)}`.trim()}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                                            <div className="flex items-start gap-2">
                                                <CalendarClock size={15} className="mt-0.5 shrink-0" />
                                                <span>{formatDate(rental.started_at)} <span className="text-border">→</span> {formatDate(rental.expires_at)}</span>
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{formatDuration(rental)}</td>
                                        <td className="px-4 py-4">
                                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(rental)}`}>
                                                {statusLabel(rental)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {!loading && !error && (page > 1 || rentals.length > 0) && (
                <Pagination
                    page={page}
                    hasNextPage={hasMore}
                    loading={loading}
                    onPageChange={setPage}
                />
            )}
        </div>
    );
}

function RentalContent({ rental, isPpv }: { rental: UserPurchase; isPpv: boolean }) {
    return (
        <>
            <div className="mt-0.5 flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary/10 text-primary">
                {rental.content_thumbnail_url ? (
                    <img src={rental.content_thumbnail_url} alt="" className="h-full w-full object-cover" />
                ) : isPpv ? <Ticket size={18} /> : <Film size={18} />}
            </div>
            <div className="min-w-0 pt-0.5">
                <p className="font-semibold text-foreground group-hover:text-primary group-focus-visible:text-primary">{rental.content_title || rental.plan_name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{rental.content_title ? rental.plan_name : isPpv ? "Pay Per View" : "Rental"}</p>
            </div>
        </>
    );
}
