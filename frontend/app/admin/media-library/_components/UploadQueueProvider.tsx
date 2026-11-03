"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, AlertTriangle, Loader2, X } from "lucide-react";
import type { MediaAsset } from "./AssetRow";
import { useUploadQueue } from "./useUploadQueue";

export interface UploadListener {
    onUploaded?: (asset: MediaAsset) => void;
    onDrained?: (summary: { done: number; failed: number }) => void;
}

type QueueApi = ReturnType<typeof useUploadQueue>;

interface UploadQueueContextValue extends QueueApi {
    subscribe: (listener: UploadListener) => () => void;
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

export function useUploadQueueContext(): UploadQueueContextValue {
    const ctx = useContext(UploadQueueContext);
    if (!ctx) throw new Error("useUploadQueueContext must be used inside UploadQueueProvider");
    return ctx;
}

const MEDIA_LIBRARY_PATH = "/admin/media-library";
const SUMMARY_VISIBLE_MS = 8000;

/** Lives in the admin layout so queued and running uploads survive client-side navigation. */
export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
    const listenersRef = useRef(new Set<UploadListener>());
    const [summary, setSummary] = useState<{ done: number; failed: number } | null>(null);

    const queue = useUploadQueue({
        onUploaded: (asset) => listenersRef.current.forEach((l) => l.onUploaded?.(asset)),
        onDrained: (result) => {
            setSummary(result);
            listenersRef.current.forEach((l) => l.onDrained?.(result));
        },
    });

    const subscribe = useCallback((listener: UploadListener) => {
        listenersRef.current.add(listener);
        return () => {
            listenersRef.current.delete(listener);
        };
    }, []);

    const { items, hasPending, addFiles, cancel, retry, retryAllFailed } = queue;
    const value = useMemo<UploadQueueContextValue>(
        () => ({ items, hasPending, addFiles, cancel, retry, retryAllFailed, subscribe }),
        [items, hasPending, addFiles, cancel, retry, retryAllFailed, subscribe],
    );

    useEffect(() => {
        if (!summary) return;
        const timer = setTimeout(() => setSummary(null), SUMMARY_VISIBLE_MS);
        return () => clearTimeout(timer);
    }, [summary]);

    const pathname = usePathname();
    const onLibraryPage = pathname?.startsWith(MEDIA_LIBRARY_PATH) ?? false;

    return (
        <UploadQueueContext.Provider value={value}>
            {children}
            {!onLibraryPage && (
                <UploadTray items={items} summary={summary} onDismissSummary={() => setSummary(null)} />
            )}
        </UploadQueueContext.Provider>
    );
}

// ─── Floating tray shown on every admin page except the Media Library ─────────

function UploadTray({
    items,
    summary,
    onDismissSummary,
}: {
    items: QueueApi["items"];
    summary: { done: number; failed: number } | null;
    onDismissSummary: () => void;
}) {
    if (items.length === 0 && !summary) return null;

    const active = items.filter((i) => i.status === "uploading").length;
    const draft = items.filter((i) => i.status === "queued").length;
    const failed = items.filter((i) => i.status === "failed").length;
    const inProgress = items.filter((i) => i.status !== "failed");
    const totalBytes = inProgress.reduce((sum, i) => sum + i.file.size, 0);
    const doneBytes = inProgress.reduce((sum, i) => sum + i.uploadedBytes, 0);
    const percent = totalBytes > 0 ? Math.min((doneBytes / totalBytes) * 100, 100) : 0;

    if (items.length === 0 && summary) {
        const ok = summary.failed === 0;
        return (
            <div className="fixed bottom-6 right-6 z-50 w-80 rounded-xl border border-border bg-card shadow-lg p-4 flex items-center gap-3 text-sm">
                {ok ? <CheckCircle2 size={16} className="text-green-400 shrink-0" /> : <AlertTriangle size={16} className="text-red-400 shrink-0" />}
                <span className="flex-1 text-foreground">
                    {summary.done} {summary.done === 1 ? "file" : "files"} uploaded{summary.failed > 0 ? `, ${summary.failed} failed` : ""}
                </span>
                <Link href={MEDIA_LIBRARY_PATH} className="text-xs font-semibold text-primary hover:underline">View</Link>
                <button onClick={onDismissSummary} className="opacity-60 hover:opacity-100"><X size={13} /></button>
            </div>
        );
    }

    return (
        <div className="fixed bottom-6 right-6 z-50 w-80 rounded-xl border border-border bg-card shadow-lg p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-sm">
                {active > 0 || draft > 0
                    ? <Loader2 size={14} className="animate-spin text-primary shrink-0" />
                    : <AlertTriangle size={14} className="text-red-400 shrink-0" />}
                <span className="flex-1 font-medium text-foreground">
                    Uploads · {active} active
                    {draft > 0 && ` · ${draft} draft`}
                    {failed > 0 && <span className="text-red-300">{` · ${failed} failed`}</span>}
                </span>
                <Link href={MEDIA_LIBRARY_PATH} className="text-xs font-semibold text-primary hover:underline">View</Link>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground">{percent.toFixed(0)}% overall. Uploads continue while you browse the admin.</p>
        </div>
    );
}
