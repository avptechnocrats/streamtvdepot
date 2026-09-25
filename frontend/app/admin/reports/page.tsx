"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { AlertTriangle, BadgeDollarSign, Clapperboard, Headphones, MessageSquare, Radio, RefreshCw, Tv, Users } from "lucide-react";
import { fetchAdminReports } from "@/lib/api";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function Metric({ label, value, note, icon: Icon }: { label: string; value: number; note: string; icon: React.ElementType }) {
    return (
        <div className="border border-border bg-card rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                <Icon size={18} className="text-primary shrink-0" />
            </div>
            <p className="mt-3 text-2xl font-display font-700 text-foreground">{value.toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
        </div>
    );
}

function StatusList({ items, emptyText }: { items: Record<string, number>; emptyText: string }) {
    const entries = Object.entries(items);
    if (!entries.length) return <p className="text-sm text-muted-foreground py-5">{emptyText}</p>;

    return (
        <div className="divide-y divide-border">
            {entries.map(([label, count]) => (
                <div key={label} className="flex items-center justify-between py-3 text-sm">
                    <span className="capitalize text-muted-foreground">{label.replaceAll("_", " ")}</span>
                    <span className="font-semibold text-foreground">{count.toLocaleString()}</span>
                </div>
            ))}
        </div>
    );
}

const STATUS_COLORS = ["hsl(var(--primary))", "hsl(188 82% 60%)", "hsl(42 92% 58%)", "hsl(0 72% 56%)", "hsl(215 18% 58%)"];

function StatusDonut({ items, emptyText }: { items: Record<string, number>; emptyText: string }) {
    const entries = Object.entries(items).map(([name, value]) => ({ name: name.replaceAll("_", " "), value }));
    if (!entries.length) return <p className="py-16 text-center text-sm text-muted-foreground">{emptyText}</p>;

    return (
        <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <ChartContainer className="h-[220px] w-full" config={{ value: { label: "Payments", color: "hsl(var(--primary))" } } satisfies ChartConfig}>
                <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                    <Pie data={entries} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={3} strokeWidth={0}>
                        {entries.map((entry, index) => <Cell key={entry.name} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />)}
                    </Pie>
                </PieChart>
            </ChartContainer>
            <div className="space-y-2">
                {entries.map((entry, index) => (
                    <div key={entry.name} className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex min-w-0 items-center gap-2 capitalize text-muted-foreground"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[index % STATUS_COLORS.length] }} />{entry.name}</span>
                        <span className="font-semibold text-foreground">{entry.value.toLocaleString()}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function ReportsPage() {
    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: ["client-admin-reports", 6],
        queryFn: () => fetchAdminReports(6),
    });
    const summary = data?.summary;
    const revenueConfig = { value: { label: "Revenue", color: "hsl(var(--primary))" } } satisfies ChartConfig;
    const audienceConfig = { value: { label: "New users", color: "hsl(188 82% 60%)" } } satisfies ChartConfig;
    const subscriptionsConfig = { value: { label: "Subscriptions", color: "hsl(42 92% 58%)" } } satisfies ChartConfig;

    return (
        <div className="p-5 sm:p-8 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-2xl font-display font-700 text-foreground">Reports</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Business performance for the last six months.</p>
                </div>
                <button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50">
                    <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} /> Refresh
                </button>
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 rounded-lg border border-border bg-card animate-pulse" />)}
                </div>
            ) : !data || !summary ? (
                <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Reports are temporarily unavailable. Refresh to try again.</div>
            ) : (
                <Tabs defaultValue="revenue" className="space-y-5">
                    <TabsList className="h-auto w-full justify-start overflow-x-auto bg-muted/50 p-1">
                        <TabsTrigger value="revenue" className="gap-1.5"><BadgeDollarSign size={14} className="text-emerald-500" />Revenue</TabsTrigger>
                        <TabsTrigger value="audience" className="gap-1.5"><Users size={14} className="text-cyan-500" />Audience</TabsTrigger>
                        <TabsTrigger value="content" className="gap-1.5"><Tv size={14} className="text-amber-500" />Content</TabsTrigger>
                        <TabsTrigger value="support" className="gap-1.5"><MessageSquare size={14} className="text-rose-500" />Support</TabsTrigger>
                    </TabsList>

                    <TabsContent value="revenue" className="space-y-4 m-0">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {data.revenue_by_currency.map(({ currency, amount }) => <Metric key={currency} label={`${currency} revenue`} value={amount} note="Successful payments, all time" icon={BadgeDollarSign} />)}
                            {!data.revenue_by_currency.length && <Metric label="Revenue" value={0} note="No successful payments yet" icon={BadgeDollarSign} />}
                            <Metric label="Successful payments" value={data.payment_statuses.SUCCESS ?? 0} note="Completed transactions" icon={BadgeDollarSign} />
                            <Metric label="Failed payments" value={data.payment_statuses.FAILED ?? 0} note="Review payment recovery" icon={AlertTriangle} />
                        </div>
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
                            <div className="rounded-lg border border-border bg-card p-4">
                                <h2 className="text-sm font-semibold text-foreground">Monthly revenue</h2>
                                <p className="mt-1 text-xs text-muted-foreground">Values are shown in the tenant's payment currency mix.</p>
                                <ChartContainer className="mt-4 h-[280px] w-full" config={revenueConfig}>
                                    <LineChart data={data.charts.revenue} margin={{ left: 8, right: 8, top: 8 }}><CartesianGrid vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} width={42} /><ChartTooltip content={<ChartTooltipContent />} /><Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart>
                                </ChartContainer>
                            </div>
                            <div className="rounded-lg border border-border bg-card p-4">
                                <h2 className="text-sm font-semibold text-foreground">Payment status</h2>
                                <p className="mt-1 text-xs text-muted-foreground">Transaction outcome distribution.</p>
                                <StatusDonut items={data.payment_statuses} emptyText="No payment activity yet." />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="audience" className="space-y-4 m-0">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            <Metric label="Registered users" value={summary.total_users} note="All audience accounts" icon={Users} />
                            <Metric label="Active subscriptions" value={summary.active_subscriptions} note="Currently entitled viewers" icon={BadgeDollarSign} />
                            <Metric label="Auto-renew on" value={summary.auto_renewing_subscriptions} note="Active subscriptions renewing automatically" icon={RefreshCw} />
                        </div>
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            <div className="rounded-lg border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">New users</h2><ChartContainer className="mt-4 h-[260px] w-full" config={audienceConfig}><LineChart data={data.charts.new_users} margin={{ left: 8, right: 8, top: 8 }}><CartesianGrid vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} /><ChartTooltip content={<ChartTooltipContent />} /><Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ChartContainer></div>
                            <div className="rounded-lg border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">Subscription status</h2><StatusList items={data.subscription_statuses} emptyText="No subscriptions yet." /></div>
                        </div>
                    </TabsContent>

                    <TabsContent value="content" className="space-y-4 m-0">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Videos" value={summary.total_videos} note="Published catalog videos" icon={Tv} /><Metric label="Audio" value={summary.total_audios} note="Published audio items" icon={Headphones} /><Metric label="Series" value={summary.total_series} note="Series in catalog" icon={Clapperboard} /><Metric label="Live channels" value={summary.total_live_channels} note="Configured live streams" icon={Radio} /><Metric label="PPV events" value={summary.total_ppv_events} note="Pay-per-view events" icon={BadgeDollarSign} /></div>
                        <div className="rounded-lg border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">Subscriptions started</h2><ChartContainer className="mt-4 h-[280px] w-full" config={subscriptionsConfig}><BarChart data={data.charts.subscriptions_started} margin={{ left: 8, right: 8, top: 8 }}><CartesianGrid vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="value" fill="var(--color-value)" radius={4} /></BarChart></ChartContainer></div>
                    </TabsContent>

                    <TabsContent value="support" className="space-y-4 m-0"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Metric label="Open workload" value={summary.open_tickets} note="Open and in-progress tickets" icon={AlertTriangle} /><Metric label="High priority" value={summary.high_priority_tickets} note="Open or in-progress high priority tickets" icon={AlertTriangle} /></div><div className="rounded-lg border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">Ticket status</h2><StatusList items={data.ticket_statuses} emptyText="No support tickets yet." /></div></TabsContent>
                </Tabs>
            )}
        </div>
    );
}