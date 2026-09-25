"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Bell, CheckCircle2, AlertTriangle, ChevronRight, Clock } from "lucide-react";

import { AlertService } from "@/lib/api/services/alerts";
import { UsageAlert, AlertStatus } from "@/types/alert";
import { Skeleton } from "@/components/ui/skeleton";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<UsageAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AlertStatus | undefined>();

  useEffect(() => {
    fetchAlerts();
  }, [page, status]);

  async function fetchAlerts() {
    setLoading(true);
    try {
      const data = await AlertService.listAlerts({
        status,
        page,
        page_size: 20,
      });
      setAlerts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const activeCount = alerts.filter((a) => a.status === "active").length;
  const acknowledgedCount = alerts.filter((a) => a.status === "acknowledged").length;

  const getThresholdIcon = (threshold: string) => {
    switch (threshold) {
      case "at_risk":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "over_limit":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "critical":
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getThresholdLabel = (threshold: string): string => {
    switch (threshold) {
      case "at_risk":
        return "At Risk (80%)";
      case "over_limit":
        return "Over Limit (100%)";
      case "critical":
        return "Critical (110%)";
      default:
        return threshold;
    }
  };

  const getStatusBadge = (status: AlertStatus) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide rounded border bg-red-500/10 text-red-500 border-red-500/20">
            <Bell className="w-3 h-3" />
            Active
          </span>
        );
      case "acknowledged":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide rounded border bg-amber-500/10 text-amber-500 border-amber-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Acknowledged
          </span>
        );
      case "resolved":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide rounded border bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Resolved
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Usage Alerts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Monitor over-limit, at-risk, and critical usage alerts across clients.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-6 flex items-center justify-between gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active Alerts</p>
              <p className="text-3xl font-bold text-red-500">{activeCount}</p>
            </div>
          </div>
          <AlertCircle className="w-12 h-12 text-red-500/20" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Acknowledged</p>
            <p className="text-3xl font-bold text-amber-500">{acknowledgedCount}</p>
          </div>
          <CheckCircle2 className="w-12 h-12 text-amber-500/20" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Alerts</p>
            <p className="text-3xl font-bold text-foreground">{alerts.length}</p>
          </div>
          <Bell className="w-12 h-12 text-primary/20" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
        {(["undefined", "active", "acknowledged", "resolved"] as const).map((key) => {
          const isActive = (key === "undefined" && status === undefined) || (key !== "undefined" && status === key);
          const statusKey = key === "undefined" ? undefined : (key as AlertStatus);
          const Icon = key === "undefined" ? Bell : key === "active" ? AlertCircle : key === "acknowledged" ? CheckCircle2 : Clock;
          
          return (
            <button
              key={key}
              onClick={() => {
                setStatus(statusKey);
                setPage(1);
              }}
              className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-card text-foreground shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={14} />
              {key === "undefined" ? "All" : key.charAt(0).toUpperCase() + key.slice(1)}
              <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {key === "undefined" ? alerts.length : alerts.filter(a => a.status === statusKey).length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Alerts Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Metric</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Threshold</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usage</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Month</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-5 py-4">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                      <CheckCircle2 size={32} className="opacity-30" />
                      <p className="text-sm">No alerts found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                alerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/usage/${alert.client_id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {alert.client_name || "N/A"}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground capitalize">{alert.metric_type}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {getThresholdIcon(alert.threshold_type)}
                        <span className="text-sm font-medium text-foreground">{getThresholdLabel(alert.threshold_type)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="text-sm font-semibold text-foreground">{alert.usage_percentage.toFixed(1)}%</div>
                      <div className="text-xs text-muted-foreground">
                        {alert.current_usage.toFixed(2)} / {alert.plan_limit?.toFixed(2) || "∞"}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {MONTH_NAMES[alert.billing_month - 1]} {alert.billing_year}
                    </td>
                    <td className="px-5 py-4">{getStatusBadge(alert.status)}</td>
                    <td className="px-5 py-4 text-center">
                      <Link
                        href={`/admin/usage/${alert.client_id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium border border-border bg-secondary text-foreground hover:bg-surface-hover transition-colors"
                      >
                        View <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
