"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Plus, RefreshCw, Globe, Mail, Wand2, X, Eye, EyeOff, CheckCircle, Copy, AlertTriangle, Archive, Clock } from "lucide-react";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { listClients, createClient, createClientAdminUser, provisionClientDemoContent, listPlans, getClientSubscription, archiveClient, unarchiveClient, getClientTabCounts, type ClientOut, type ClientCreatePayload, type ClientSubscriptionOut, type ClientStatus } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const TIMEZONES = [
    "UTC", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo",
    "America/New_York", "America/Chicago", "America/Los_Angeles",
    "Europe/London", "Europe/Paris", "Europe/Berlin", "Australia/Sydney",
];

type ClientTab = "all" | "active" | "expired" | "archived";

const CLIENT_TABS: Array<{ key: ClientTab; label: string; icon: React.ElementType }> = [
    { key: "all", label: "All", icon: Globe },
    { key: "active", label: "Active", icon: CheckCircle },
    { key: "expired", label: "Expired", icon: Clock },
    { key: "archived", label: "Archived", icon: Archive },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INPUT = "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const LABEL = "text-xs font-medium text-muted-foreground uppercase tracking-wider";

function slugify(v: string) {
    return v.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
}

// ─── Add Client Modal ─────────────────────────────────────────────────────────

function AddClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: ClientOut) => void }) {
    const [name, setName]             = useState("");
    const [slug, setSlug]             = useState("");
    const [email, setEmail]           = useState("");
    const [phone, setPhone]           = useState("");
    const [country, setCountry]       = useState("");
    const [timezone, setTimezone]     = useState("UTC");
    const [domain, setDomain]         = useState("");
    const [website, setWebsite]       = useState("");
    const [adminName, setAdminName]   = useState("");
    const [password, setPassword]     = useState("");
    const [showPwd, setShowPwd]       = useState(false);
    const [saving, setSaving]         = useState(false);
    const [error, setError]           = useState<string | null>(null);
    const [created, setCreated]       = useState<{ client: ClientOut; email: string; password: string } | null>(null);
    const [copied, setCopied]         = useState<"email" | "pwd" | null>(null);

    function copyText(text: string, key: "email" | "pwd") {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || !slug.trim() || !email.trim() || !password.trim()) {
            setError("Name, slug, email and password are required.");
            return;
        }
        if (!adminName.trim()) {
            setError("Admin full name is required.");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const clientPayload: ClientCreatePayload = {
                name: name.trim(),
                slug: slug.trim(),
                email: email.trim(),
                phone: phone.trim() || null,
                country: country.trim() || null,
                timezone,
                domain: domain.trim() || null,
                website: website.trim() || null,
            };
            const client = await createClient(clientPayload);
            // Create admin user — password is sent as request body, never in URL
            await createClientAdminUser(client.id, {
                email: email.trim(),
                password,
                full_name: adminName.trim(),
            });
            setCreated({ client, email: email.trim(), password });
            onCreated(client);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                ?? (err instanceof Error ? err.message : "Failed to create client.");
            setError(msg);
        } finally {
            setSaving(false);
        }
    }

    if (created) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
                    <div className="p-6 flex flex-col items-center gap-4 text-center">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                            <CheckCircle size={24} className="text-emerald-500" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-foreground">{created.client.name} created!</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">Share these login credentials with the client.</p>
                        </div>
                        <div className="w-full rounded-xl border border-border bg-secondary/40 p-4 space-y-3 text-left">
                            <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Email</p>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-mono text-foreground break-all">{created.email}</span>
                                    <button onClick={() => copyText(created.email, "email")} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                                        {copied === "email" ? <CheckCircle size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Password</p>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-mono text-foreground">{created.password}</span>
                                    <button onClick={() => copyText(created.password, "pwd")} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                                        {copied === "pwd" ? <CheckCircle size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Make sure to save this password — it cannot be recovered later.</p>
                        <button onClick={onClose}
                            className="w-full px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl"
                onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-border flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-foreground">Add New Client</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Demo content will be seeded automatically.</p>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X size={16} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto 
                    [&::-webkit-scrollbar]:w-1.5
                    [&::-webkit-scrollbar-track]:bg-transparent
                    [&::-webkit-scrollbar-thumb]:rounded-full
                    [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40
                    hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/70"
                >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5 sm:col-span-2">
                            <label className={LABEL}>Platform Name *</label>
                            <input className={INPUT} value={name} placeholder="e.g. Acme TV"
                                onChange={e => { setName(e.target.value); setSlug(slugify(e.target.value)); }} />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                            <label className={LABEL}>Platform Slug *</label>
                            <div className="flex items-center gap-0">
                                <span className="px-3 py-2 rounded-l-lg border border-r-0 border-border bg-secondary text-xs text-muted-foreground">
                                    {typeof window !== "undefined" ? window.location.hostname.replace("console.", "") : "preview.signalview.tech"}/
                                </span>
                                <input className="flex-1 px-3 py-2 rounded-r-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    value={slug} placeholder="acme-tv"
                                    onChange={e => setSlug(slugify(e.target.value))} />
                            </div>
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                            <label className={LABEL}>Contact Email *</label>
                            <input className={INPUT} type="email" value={email} placeholder="admin@acme.tv"
                                onChange={e => setEmail(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Phone</label>
                            <input className={INPUT} value={phone} placeholder="+91 9876543210"
                                onChange={e => setPhone(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Country</label>
                            <input className={INPUT} value={country} placeholder="India"
                                onChange={e => setCountry(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Timezone</label>
                            <select className={INPUT} value={timezone} onChange={e => setTimezone(e.target.value)}>
                                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Domain</label>
                            <input className={INPUT} value={domain} placeholder="acme.tv"
                                onChange={e => setDomain(e.target.value)} />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                            <label className={LABEL}>Website</label>
                            <input className={INPUT} value={website} placeholder="https://acme.tv"
                                onChange={e => setWebsite(e.target.value)} />
                        </div>
                    </div>

                    {/* Admin login credentials */}
                    <div className="border-t border-border pt-4 space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Admin Login Credentials</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5 sm:col-span-2">
                                <label className={LABEL}>Admin Full Name *</label>
                                <input className={INPUT} value={adminName} placeholder="John Doe"
                                    onChange={e => setAdminName(e.target.value)} />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                                <label className={LABEL}>Password *</label>
                                <div className="relative">
                                    <input
                                        className={`${INPUT} pr-10`}
                                        type={showPwd ? "text" : "password"}
                                        value={password}
                                        placeholder="Min. 8 characters"
                                        autoComplete="new-password"
                                        onChange={e => setPassword(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        tabIndex={-1}
                                        onClick={() => setShowPwd(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                                <p className="text-[11px] text-muted-foreground">The client will use this email + password to log in to their admin panel.</p>
                            </div>
                        </div>
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <div className="flex items-center justify-end gap-3 pt-1">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                            {saving ? "Creating…" : "Create Client"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientsPage() {
    const [clients, setClients] = useState<ClientOut[]>([]);
    const [subscriptionsByClientId, setSubscriptionsByClientId] = useState<Record<string, ClientSubscriptionOut | null>>({});
    const [planNameById, setPlanNameById] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [page, setPage] = useState(1);
    const [activeTab, setActiveTab] = useState<ClientTab>("all");
    const [hasMore, setHasMore] = useState(false);
    const [tabCounts, setTabCounts] = useState<{ active: number; expired: number; archived: number }>({
        active: 0,
        expired: 0,
        archived: 0,
    });

    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const router = useRouter();

    const { toast } = useToast();
    const [provisioningId, setProvisioningId] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [reseedTarget, setReseedTarget] = useState<ClientOut | null>(null);
    const [reseedAlreadyExists, setReseedAlreadyExists] = useState(false);
    const [archiveTarget, setArchiveTarget] = useState<ClientOut | null>(null);
    const [archivingId, setArchivingId] = useState<string | null>(null);
    const [unarchivingId, setUnarchivingId] = useState<string | null>(null);

    const isArchivedClient = useCallback((client: ClientOut) => {
        return !client.is_active && client.status === "inactive";
    }, []);

    const isSuspendedClient = useCallback((client: ClientOut) => {
        return client.status === "suspended";
    }, []);

    const resolveReinstateStatus = useCallback((client: ClientOut): ClientStatus => {
        const sub = subscriptionsByClientId[client.id];
        if (!sub) return "inactive";
        const isExpiredByDate = !!sub.expires_at && new Date(sub.expires_at).getTime() < Date.now();
        if (sub.status === "trial") return "trial";
        if (sub.status === "active" && !isExpiredByDate) return "active";
        return "inactive";
    }, [subscriptionsByClientId]);

    const resolvePlanLabel = useCallback((client: ClientOut) => {
        const sub = subscriptionsByClientId[client.id];
        if (!sub) return "";
        const isExpiredByDate = !!sub.expires_at && new Date(sub.expires_at).getTime() < Date.now();
        if (sub.status === "expired" || isExpiredByDate) return "Expired";
        if (sub.status === "active" || sub.status === "trial") {
            return planNameById[sub.plan_id] ?? "Active";
        }
        return "";
    }, [planNameById, subscriptionsByClientId]);

    async function handleProvision(client: ClientOut) {
        setProvisioningId(client.id);
        try {
            await provisionClientDemoContent(client.id);
            toast({
                description: `Demo content seeded for "${client.name}". They can now preview their site.`,
                variant: "success",
                duration: 4000,
            });
        } catch (err: unknown) {
            const is409 = (err as { response?: { status?: number } })?.response?.status === 409;
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                ?? (err instanceof Error ? err.message : "Unknown error");
            if (is409) {
                // Show the "already seeded" confirmation modal
                setReseedAlreadyExists(true);
                setReseedTarget(client);
            } else {
                toast({ description: msg, variant: "destructive", duration: 5000 });
            }
        } finally {
            setProvisioningId(null);
        }
    }

    async function handleReseed(client: ClientOut) {
        setReseedTarget(null);
        setProvisioningId(client.id);
        try {
            await provisionClientDemoContent(client.id, true);
            toast({
                description: `Demo content re-seeded for "${client.name}".`,
                variant: "success",
                duration: 4000,
            });
        } catch (e2: unknown) {
            const msg = (e2 as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                ?? (e2 instanceof Error ? e2.message : "Unknown error");
            toast({ description: msg, variant: "destructive", duration: 5000 });
        } finally {
            setProvisioningId(null);
        }
    }

    async function handleArchive(client: ClientOut) {
        setArchivingId(client.id);
        try {
            const updated = await archiveClient(client.id);
            setClients(prev => prev.map(item => item.id === updated.id ? updated : item));
            toast({
                description: `"${client.name}" has been archived.`,
                variant: "success",
                duration: 3500,
            });
            await fetchClients(page, search, activeTab);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                ?? (err instanceof Error ? err.message : "Failed to archive client.");
            toast({ description: msg, variant: "destructive", duration: 5000 });
        } finally {
            setArchivingId(null);
            setArchiveTarget(null);
        }
    }

    async function handleUnarchive(client: ClientOut) {
        setUnarchivingId(client.id);
        try {
            const reinstatedStatus = resolveReinstateStatus(client);
            const updated = await unarchiveClient(client.id, reinstatedStatus);
            setClients(prev => prev.map(item => item.id === updated.id ? updated : item));
            toast({
                description: `"${client.name}" has been un-archived.`,
                variant: "success",
                duration: 3500,
            });
            await fetchClients(page, search, activeTab);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                ?? (err instanceof Error ? err.message : "Failed to un-archive client.");
            toast({ description: msg, variant: "destructive", duration: 5000 });
        } finally {
            setUnarchivingId(null);
        }
    }

    const fetchClients = useCallback(async (currentPage: number, currentSearch: string, tab: ClientTab) => {
        setLoading(true);
        setError(null);
        try {
            const counts = await getClientTabCounts(currentSearch);
            setTabCounts(counts);

            const planList = await listPlans();
            setPlanNameById(
                Object.fromEntries(planList.map(plan => [plan.id, plan.name])),
            );

            const data = await listClients({
                page: currentPage,
                page_size: PAGE_SIZE,
                tab,
                status: tab,
                ...(currentSearch ? { search: currentSearch } : {}),
            });
            setClients(data);
            setHasMore(data.length === PAGE_SIZE);

            const subscriptionRows = await Promise.all(
                data.map(async (client) => {
                    try {
                        const subscription = await getClientSubscription(client.id);
                        return [client.id, subscription] as const;
                    } catch {
                        return [client.id, null] as const;
                    }
                }),
            );
            setSubscriptionsByClientId(Object.fromEntries(subscriptionRows));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to load clients";
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchClients(page, search, activeTab);
    }, [fetchClients, page, search, activeTab]);

    function handleSearch(e: React.FormEvent) {
        e.preventDefault();
        setPage(1);
        setSearch(searchInput.trim());
    }

    function handleSearchClear() {
        setSearchInput("");
        setPage(1);
        setSearch("");
    }

    return (
        <>
        <div className="p-8 space-y-6">

            {/* Page header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">Clients</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Manage all client accounts on the platform.
                    </p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity self-start">
                    <Plus size={15} />
                    Add Client
                </button>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                {/* Tabs */}
                <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
                    {CLIENT_TABS.map((tab) => {
                        const isActive = activeTab === tab.key;
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => {
                                    setPage(1);
                                    setActiveTab(tab.key);
                                }}
                                className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${
                                    isActive
                                        ? "bg-card text-foreground shadow-sm border border-border/50"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <Icon size={14} />
                                {tab.label}
                                <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                    {tab.key === "all" ? clients.length : tabCounts[tab.key]}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="ml-auto flex items-center gap-0">
                    <form onSubmit={handleSearch} className="relative w-full lg:w-auto lg:min-w-[420px]">
                        <Search
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                        />
                        <input
                            type="search"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Escape" && handleSearchClear()}
                            placeholder="Search by name or email…"
                            className="w-full h-9 pl-8 pr-3 rounded-l-md rounded-r-none bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        />
                    </form>

                    <button
                        onClick={() => fetchClients(page, search, activeTab)}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-2 h-9 rounded-r-md rounded-l-none border border-border border-l-0 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors bg-secondary/50 disabled:opacity-50"
                        aria-label="Refresh"
                    >
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Error state */}
            {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                    {error}
                </div>
            )}

            {/* Table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto scrollbar-themed">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-secondary/40">
                                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Client
                                </th>
                                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Domain
                                </th>
                                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Email
                                </th>
                                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Plan
                                </th>
                                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Created
                                </th>
                                <th className="px-5 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading && (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <tr key={i}>
                                        {/* Client */}
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <Skeleton className="w-8 h-8 rounded-md shrink-0" />
                                                <div className="space-y-1.5 min-w-0">
                                                    <Skeleton className="h-3.5 w-28" />
                                                    <Skeleton className="h-3 w-16" />
                                                </div>
                                            </div>
                                        </td>
                                        {/* Domain */}
                                        <td className="px-5 py-3.5">
                                            <Skeleton className="h-3.5 w-28" />
                                        </td>
                                        {/* Email */}
                                        <td className="px-5 py-3.5">
                                            <Skeleton className="h-3.5 w-36" />
                                        </td>
                                        {/* Plan */}
                                        <td className="px-5 py-3.5">
                                            <Skeleton className="h-3.5 w-20" />
                                        </td>
                                        {/* Created */}
                                        <td className="px-5 py-3.5">
                                            <Skeleton className="h-3.5 w-24" />
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <Skeleton className="h-7 w-44 rounded-md" />
                                        </td>
                                    </tr>
                                ))
                            )}

                            {!loading && clients.length === 0 && !error && (
                                <tr>
                                    <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground text-sm">
                                        {search
                                            ? `No clients found for "${search}".`
                                            : "No clients yet. Add one to get started."}
                                    </td>
                                </tr>
                            )}

                            {!loading && clients.map((client) => (
                                <tr
                                    key={client.id}
                                    className="hover:bg-surface-hover transition-colors cursor-pointer"
                                    onClick={() => router.push(`/admin/clients/${client.id}`)}
                                >
                                    {/* Client name + slug */}
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                            {client.logo_url ? (
                                                <img
                                                    src={client.logo_url}
                                                    alt={client.name}
                                                    className="w-8 h-8 rounded-md object-cover shrink-0 border border-border"
                                                />
                                            ) : (
                                                <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                                    <span className="text-primary text-xs font-bold uppercase">
                                                        {client.name[0]}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <p className="font-medium text-foreground truncate">{client.name}</p>
                                                    {activeTab === "all" && isArchivedClient(client) && (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">Archived</span>
                                                    )}
                                                    {activeTab === "all" && isSuspendedClient(client) && (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Suspended</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground truncate">/{client.slug}</p>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Domain */}
                                    <td className="px-5 py-3.5">
                                        {client.domain ? (
                                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                                <Globe size={12} className="shrink-0" />
                                                <span className="truncate max-w-[160px]">{client.domain}</span>
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground/40 text-xs">—</span>
                                        )}
                                    </td>

                                    {/* Email */}
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-1.5 text-muted-foreground" title={client.email}>
                                            <Mail size={12} className="shrink-0" />
                                            <span className="truncate max-w-[240px]">{client.email}</span>
                                        </div>
                                    </td>

                                    {/* Plan */}
                                    <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                                        {resolvePlanLabel(client)}
                                    </td>

                                    {/* Created at */}
                                    <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                                        {formatDate(client.created_at)}
                                    </td>

                                    <td className="px-5 py-3.5 text-right">
                                        <div className="flex items-center gap-2 justify-end">
                                            {!isArchivedClient(client) && !isSuspendedClient(client) && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setReseedTarget(client); }}
                                                    disabled={provisioningId === client.id}
                                                    title="Seed demo content to this client"
                                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-green-500/30 text-xs text-green-400 hover:border-green-500/50 hover:bg-green-500/20 hover:text-green-500 disabled:opacity-40 transition-colors whitespace-nowrap bg-green-500/10"
                                                >
                                                    <Wand2 size={12} className={provisioningId === client.id ? "animate-spin" : ""} />
                                                    {provisioningId === client.id ? "Seeding…" : "Seed Demo"}
                                                </button>
                                            )}

                                            {!isArchivedClient(client) && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setArchiveTarget(client);
                                                    }}
                                                    disabled={archivingId === client.id}
                                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-red-500/30 text-xs text-red-400 hover:border-red-500/50 hover:bg-red-500/20 hover:text-red-500 disabled:opacity-40 transition-colors whitespace-nowrap bg-red-500/10"
                                                >
                                                    <Archive size={12} />
                                                    {archivingId === client.id ? "Archiving…" : "Archive"}
                                                </button>
                                            )}

                                            {isArchivedClient(client) && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleUnarchive(client);
                                                    }}
                                                    disabled={unarchivingId === client.id}
                                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-emerald-500/30 text-xs text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/20 hover:text-emerald-500 disabled:opacity-40 transition-colors whitespace-nowrap bg-emerald-500/10"
                                                >
                                                    {unarchivingId === client.id ? "Un-Archiving…" : "Un-Archive"}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination footer */}
                {(page > 1 || hasMore) && (
                    <div className="border-t border-border px-5 py-3 flex items-center justify-between bg-secondary/20">
                        <span className="text-xs text-muted-foreground">
                            Page {page}
                        </span>
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (page > 1) setPage((p) => p - 1);
                                        }}
                                        aria-disabled={page === 1 || loading}
                                        className={page === 1 || loading ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>
                                <PaginationItem>
                                    <PaginationNext
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (hasMore) setPage((p) => p + 1);
                                        }}
                                        aria-disabled={!hasMore || loading}
                                        className={!hasMore || loading ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </div>
                )}
            </div>
        </div>

        {/* Seed Demo confirm modal */}
        {reseedTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
                    <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
                            reseedAlreadyExists 
                                ? "bg-yellow-500/10 border-yellow-500/20" 
                                : "bg-green-500/10 border-green-500/20"
                        }`}>
                            {reseedAlreadyExists ? (
                                <AlertTriangle size={16} className="text-yellow-500" />
                            ) : (
                                <Wand2 size={16} className="text-green-500" />
                            )}
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-foreground">
                                {reseedAlreadyExists ? "Already seeded" : "Seed demo content?"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {reseedAlreadyExists ? (
                                    <>
                                        <span className="font-medium text-foreground">{reseedTarget.name}</span> already has content categories.
                                        Re-seeding may create duplicate entries.
                                    </>
                                ) : (
                                    <>
                                        Demo content will be added to <span className="font-medium text-foreground">{reseedTarget.name}</span>.
                                        They can then preview their site with sample categories and content.
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-3">
                        <button
                            onClick={() => {
                                setReseedTarget(null);
                                setReseedAlreadyExists(false);
                            }}
                            disabled={provisioningId === reseedTarget.id}
                            className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                if (reseedAlreadyExists) {
                                    setReseedAlreadyExists(false);
                                    void handleReseed(reseedTarget);
                                } else {
                                    setReseedTarget(null);
                                    void handleProvision(reseedTarget);
                                }
                            }}
                            disabled={provisioningId === reseedTarget.id}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg text-white transition-colors disabled:opacity-50 ${
                                reseedAlreadyExists 
                                    ? "bg-yellow-500 hover:bg-yellow-600" 
                                    : "bg-green-500 hover:bg-green-600"
                            }`}
                        >
                            {provisioningId === reseedTarget.id ? (
                                reseedAlreadyExists ? "Re-seeding…" : "Seeding…"
                            ) : (
                                reseedAlreadyExists ? "Re-seed anyway" : "Seed Demo"
                            )}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {showAddModal && (
            <AddClientModal
                onClose={() => setShowAddModal(false)}
                onCreated={(client) => {
                    setClients(prev => [client, ...prev]);
                    setSubscriptionsByClientId(prev => ({ ...prev, [client.id]: null }));
                    setShowAddModal(false);
                }}
            />
        )}

        {/* Archive confirm modal */}
        {archiveTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                            <Archive size={16} className="text-red-500" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-foreground">Archive client?</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                <span className="font-medium text-foreground">{archiveTarget.name}</span> will be moved to Archived.
                                This disables the client account for active operations.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-3">
                        <button
                            onClick={() => setArchiveTarget(null)}
                            disabled={archivingId === archiveTarget.id}
                            className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => handleArchive(archiveTarget)}
                            disabled={archivingId === archiveTarget.id}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                        >
                            {archivingId === archiveTarget.id ? "Archiving…" : "Archive"}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
