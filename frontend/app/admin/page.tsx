"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Palette, Film, Layers, Grid2x2, ExternalLink, ArrowRight, Users, CalendarDays, Ticket, Receipt } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { getAdminFirstName } from "@/lib/admin-auth";
import {
    fetchAdminDashboardAnalytics,
    fetchSuperadminDashboardAnalytics,
    type AdminDashboardChartPoint,
    type SuperadminDashboardChartPoint,
} from "@/lib/api";
import { TOKEN_KEYS } from "@/lib/api/client";
import { getClientSlugFromAccessToken } from "@/lib/admin-auth";
import {
    CartesianGrid,
    Line,
    LineChart,
    Bar,
    BarChart,
    XAxis,
    YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

interface SuperadminTopStats {
    plans: number | null;
    clients: number | null;
    invoices: number | null;
    demoBookings: number | null;
    tickets: number | null;
}

interface ClientAdminTopStats {
    plans: number | null;
    users: number | null;
    liveTv: number | null;
    themes: number | null;
    tickets: number | null;
}

const STAT_ICON_CLASSES: Record<string, string> = {
    Plans: "bg-violet-600 text-white",
    Users: "bg-sky-600 text-white",
    "Live TV": "bg-rose-600 text-white",
    Themes: "bg-emerald-600 text-white",
    Tickets: "bg-amber-500 text-white",
    Clients: "bg-cyan-600 text-white",
    Invoices: "bg-teal-600 text-white",
    "Demo Bookings": "bg-orange-600 text-white",
    "Available Themes": "bg-emerald-600 text-white",
    "Site Default Theme": "bg-fuchsia-600 text-white",
    "Content Rows": "bg-indigo-600 text-white",
    "Browse Categories": "bg-blue-600 text-white",
};

function StatIcon({ label, Icon }: { label: string; Icon: React.ElementType }) {
    return (
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg shadow-sm ${STAT_ICON_CLASSES[label] ?? "bg-primary text-primary-foreground"}`}>
            <Icon size={28} strokeWidth={2.25} aria-hidden="true" />
        </div>
    );
}

function ClientAdminDashboard() {
    const { activeThemeId, themes, activeTheme, siteThemeId } = useTheme();
    const { session } = useAdminAuth();
    const firstName = getAdminFirstName(session);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [stats, setStats] = useState<ClientAdminTopStats>({
        plans: null,
        users: null,
        liveTv: null,
        themes: themes.length,
        tickets: null,
    });
    const [usersChart, setUsersChart] = useState<AdminDashboardChartPoint[]>([]);
    const [videosChart, setVideosChart] = useState<AdminDashboardChartPoint[]>([]);
    const [transactionsChart, setTransactionsChart] = useState<AdminDashboardChartPoint[]>([]);

    const isLightTheme = activeThemeId === "gold-light";
    const usersLineColor = isLightTheme ? "hsl(22 20% 18%)" : "hsl(42 92% 58%)";
    const videosBarColor = isLightTheme ? "hsl(28 16% 18%)" : "hsl(188 82% 60%)";
    const transactionsBarColor = isLightTheme ? "hsl(24 18% 22%)" : "hsl(194 72% 74%)";

    useEffect(() => {
        setStats((current) => ({ ...current, themes: themes.length }));
    }, [themes.length]);

    // Build preview URL from the client_slug embedded in the access token
    useEffect(() => {
        if (typeof window === "undefined") return;
        const token = localStorage.getItem(TOKEN_KEYS.access);
        if (!token) return;
        const slug = getClientSlugFromAccessToken(token);
        if (slug) setPreviewUrl(`https://${slug}.preview.streamtvdepot.com`);
    }, []);

    useEffect(() => {
        fetchAdminDashboardAnalytics(6)
            .then((analytics) => {
                setStats({
                    plans: analytics.widgets.plans,
                    users: analytics.widgets.users,
                    liveTv: analytics.widgets.live_tv,
                    themes: themes.length,
                    tickets: analytics.widgets.tickets,
                });
                setUsersChart(analytics.charts.users);
                setVideosChart(analytics.charts.videos);
                setTransactionsChart(analytics.charts.transactions);
            })
            .catch(() => {
                setStats({
                    plans: null,
                    users: null,
                    liveTv: null,
                    themes: themes.length,
                    tickets: null,
                });
                setUsersChart([]);
                setVideosChart([]);
                setTransactionsChart([]);
            });
    }, [themes.length]);

    const cardData = [
        { label: "Plans", value: stats.plans !== null ? String(stats.plans) : "-", icon: Layers, desc: "Active client plans" },
        { label: "Users", value: stats.users !== null ? String(stats.users) : "-", icon: Users, desc: "Registered end users" },
        { label: "Live TV", value: stats.liveTv !== null ? String(stats.liveTv) : "-", icon: Film, desc: "Live channels" },
        { label: "Themes", value: stats.themes !== null ? String(stats.themes) : "-", icon: Palette, desc: "Available theme variants" },
        { label: "Tickets", value: stats.tickets !== null ? String(stats.tickets) : "-", icon: Ticket, desc: "End-user support tickets" },
    ];

    return (
        <div className="p-8 space-y-10">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-display font-700 text-foreground">
                        Welcome back, <span className="text-gradient-gold">{firstName}</span> 👋
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage your client workspace from here.</p>
                </div>
                {/* <a
                    href={previewUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm transition-colors self-start ${
                        previewUrl
                            ? "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                            : "text-muted-foreground/40 cursor-not-allowed pointer-events-none"
                    }`}
                >
                    <ExternalLink size={14} />
                    Preview Site
                </a> */}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {cardData.map(({ label, value, icon: Icon, desc }) => (
                    <div key={label} className="bg-card border border-border rounded-xl p-5 space-y-3 hover:border-border/80 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground leading-tight">{label}</p>
                            <StatIcon label={label} Icon={Icon} />
                        </div>
                        <p className="text-xl font-display font-700 text-foreground truncate">{value}</p>
                        <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                ))}
            </div>

            <div className="space-y-4">
                <h2 className="text-sm font-semibold text-foreground">Analytics (Last 6 Months)</h2>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Users</p>
                        <ChartContainer
                            className="h-[220px] w-full"
                            config={{
                                value: { label: "Users", color: usersLineColor },
                            } satisfies ChartConfig}
                        >
                            <LineChart data={usersChart} margin={{ left: 4, right: 8, top: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={22} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                            </LineChart>
                        </ChartContainer>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Videos</p>
                        <ChartContainer
                            className="h-[220px] w-full"
                            config={{
                                value: { label: "Videos", color: videosBarColor },
                            } satisfies ChartConfig}
                        >
                            <BarChart data={videosChart} margin={{ left: 4, right: 8, top: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={22} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="value" fill="var(--color-value)" radius={6} />
                            </BarChart>
                        </ChartContainer>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transactions</p>
                        <ChartContainer
                            className="h-[220px] w-full"
                            config={{
                                value: { label: "Transactions", color: transactionsBarColor },
                            } satisfies ChartConfig}
                        >
                            <BarChart data={transactionsChart} margin={{ left: 4, right: 8, top: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={22} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="value" fill="var(--color-value)" radius={6} />
                            </BarChart>
                        </ChartContainer>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <h2 className="text-sm font-semibold text-foreground">Active Site Theme</h2>
                <div className="bg-card border border-border rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-5">
                    <div className="w-full sm:w-40 h-16 rounded-lg overflow-hidden flex gap-1 p-2 shrink-0" style={{ background: activeTheme.previewBg }}>
                        <div className="flex-1 rounded-md opacity-80" style={{ background: activeTheme.previewCard }} />
                        <div className="flex-1 rounded-md opacity-80" style={{ background: activeTheme.previewCard }} />
                        <div className="w-1/3 rounded-md" style={{ background: activeTheme.previewAccent }} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-semibold text-foreground">{activeTheme.name}</p>
                        <p className="text-xs text-muted-foreground">{activeTheme.description}</p>
                        <div className="flex items-center gap-1.5 pt-1">
                            <div className="w-2.5 h-2.5 rounded-full ring-1 ring-white/10" style={{ background: activeTheme.previewAccent }} />
                            <span className="text-[11px] text-muted-foreground capitalize">{activeTheme.nativeAccent} accent</span>
                        </div>
                    </div>
                    <Link href="/admin/themes" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1 shrink-0">
                        Change <ArrowRight size={12} />
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default function AdminDashboard() {
    const { activeTheme, activeThemeId, siteThemeId, themes } = useTheme();
    const { session, role } = useAdminAuth();
    const firstName = getAdminFirstName(session);
    const [superadminStats, setSuperadminStats] = useState<SuperadminTopStats>({
        plans: null,
        clients: null,
        invoices: null,
        demoBookings: null,
        tickets: null,
    });
    const [clientsChart, setClientsChart] = useState<SuperadminDashboardChartPoint[]>([]);
    const [demoChart, setDemoChart] = useState<SuperadminDashboardChartPoint[]>([]);
    const [invoicesChart, setInvoicesChart] = useState<SuperadminDashboardChartPoint[]>([]);

    const siteTheme = themes.find((t) => t.id === siteThemeId);
    const isLightTheme = activeThemeId === "gold-light";
    const demoBarColor = isLightTheme ? "hsl(170 18% 20%)" : "hsl(188 82% 60%)";
    const invoiceBarColor = isLightTheme ? "hsl(28 16% 18%)" : "hsl(194 72% 74%)";

    if (role === "clientAdmin") {
        return <ClientAdminDashboard />;
    }

    const fetchSuperadminTopStats = useCallback(async () => {
        if (role !== "superadmin") return;
        try {
            const analytics = await fetchSuperadminDashboardAnalytics(6);

            setClientsChart(analytics.charts.clients);
            setDemoChart(analytics.charts.demo_requests);
            setInvoicesChart(analytics.charts.invoices);

            setSuperadminStats({
                plans: analytics.widgets.plans,
                clients: analytics.widgets.clients,
                invoices: analytics.widgets.invoices,
                demoBookings: analytics.widgets.demo_bookings,
                tickets: analytics.widgets.tickets,
            });
        } catch {
            setSuperadminStats({
                plans: null,
                clients: null,
                invoices: null,
                demoBookings: null,
                tickets: null,
            });
            setClientsChart([]);
            setDemoChart([]);
            setInvoicesChart([]);
        }
    }, [role]);

    useEffect(() => {
        fetchSuperadminTopStats();
    }, [fetchSuperadminTopStats]);

    const stats = role === "superadmin"
        ? [
            {
                label: "Plans",
                value: superadminStats.plans !== null ? String(superadminStats.plans) : "-",
                icon: Layers,
                desc: "Total subscription plans",
            },
            {
                label: "Clients",
                value: superadminStats.clients !== null ? String(superadminStats.clients) : "-",
                icon: Users,
                desc: "Total onboarded clients",
            },
            {
                label: "Invoices",
                value: superadminStats.invoices !== null ? String(superadminStats.invoices) : "-",
                icon: Receipt,
                desc: "Total generated invoices",
            },
            {
                label: "Demo Bookings",
                value: superadminStats.demoBookings !== null ? String(superadminStats.demoBookings) : "-",
                icon: CalendarDays,
                desc: "All received demo requests",
            },
            {
                label: "Tickets",
                value: superadminStats.tickets !== null ? String(superadminStats.tickets) : "-",
                icon: Ticket,
                desc: "Client support tickets",
            },
        ]
        : [
            {
                label: "Available Themes",
                value: String(themes.length),
                icon: Palette,
                desc: "Registered in theme registry",
            },
            {
                label: "Site Default Theme",
                value: siteTheme?.name ?? activeTheme.name,
                icon: Film,
                desc: "Admin-set visitor default",
            },
            {
                label: "Content Rows",
                value: "3",
                icon: Layers,
                desc: "Trending · New Releases · Top Rated",
            },
            {
                label: "Browse Categories",
                value: "6",
                icon: Grid2x2,
                desc: "Action · Drama · Sci-Fi · and more",
            },
        ];

    return (
        <div className="p-8 space-y-10">

            {/* Page header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-display font-700 text-foreground">
                        Welcome back, <span className="text-gradient-gold">{firstName}</span> 👋
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage your StreamTVDepot platform from here.
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${role === "superadmin" ? "lg:grid-cols-5" : "lg:grid-cols-4"} gap-4`}>
                {stats.map(({ label, value, icon: Icon, desc }) => (
                    <div key={label} className="bg-card border border-border rounded-xl p-5 space-y-3 hover:border-border/80 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground leading-tight">
                                {label}
                            </p>
                            <StatIcon label={label} Icon={Icon} />
                        </div>
                        <p className="text-xl font-display font-700 text-foreground truncate">{value}</p>
                        <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                ))}
            </div>

            {role === "superadmin" && (
                <div className="space-y-4">
                    <h2 className="text-sm font-semibold text-foreground">Analytics (Last 6 Months)</h2>
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clients</p>
                            <ChartContainer
                                className="h-[220px] w-full"
                                config={{
                                    value: {
                                        label: "Clients",
                                        color: "hsl(var(--primary))",
                                    },
                                } satisfies ChartConfig}
                            >
                                <LineChart data={clientsChart} margin={{ left: 4, right: 8, top: 8 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={22} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        stroke="var(--color-value)"
                                        strokeWidth={2.5}
                                        dot={{ r: 3 }}
                                        activeDot={{ r: 5 }}
                                    />
                                </LineChart>
                            </ChartContainer>
                        </div>

                        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Demo Requests</p>
                            <ChartContainer
                                className="h-[220px] w-full"
                                config={{
                                    value: {
                                        label: "Demo Requests",
                                        color: demoBarColor,
                                    },
                                } satisfies ChartConfig}
                            >
                                <BarChart data={demoChart} margin={{ left: 4, right: 8, top: 8 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={22} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Bar dataKey="value" fill="var(--color-value)" radius={6} />
                                </BarChart>
                            </ChartContainer>
                        </div>

                        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoices</p>
                            <ChartContainer
                                className="h-[220px] w-full"
                                config={{
                                    value: {
                                        label: "Invoices",
                                        color: invoiceBarColor,
                                    },
                                } satisfies ChartConfig}
                            >
                                <BarChart data={invoicesChart} margin={{ left: 4, right: 8, top: 8 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={22} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Bar dataKey="value" fill="var(--color-value)" radius={6} />
                                </BarChart>
                            </ChartContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick actions */}
            <div className="space-y-4">
                <h2 className="text-sm font-semibold text-foreground">Quick Actions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                    <Link
                        href="/admin/themes"
                        className="group flex items-center gap-4 p-5 bg-card border border-border rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all"
                    >
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors shrink-0">
                            <Palette size={18} className="text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">Theme Manager</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Change the site-wide default theme
                            </p>
                        </div>
                        <ArrowRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </Link>

                    <a
                        href="/"
                        target="_blank"
                        className="group flex items-center gap-4 p-5 bg-card border border-border rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all"
                    >
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors shrink-0">
                            <ExternalLink size={18} className="text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">Preview Site</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Open StreamTVDepot in a new tab
                            </p>
                        </div>
                        <ArrowRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </a>
                </div>
            </div>
        </div>
    );
}
