export interface WatchHistoryItem {
    id: string;
    title: string;
    image: string;
    position: number;
    duration: number;
    updatedAt: number;
}

export const WATCH_HISTORY_EVENT = "sv-watch-history-changed";

export function watchHistoryKey(tenantId: string, userId: string): string {
    return `sv-watch-history:v1:${encodeURIComponent(tenantId)}:${encodeURIComponent(userId)}`;
}

function isWatchHistoryItem(value: unknown): value is WatchHistoryItem {
    if (!value || typeof value !== "object") return false;
    const item = value as Partial<WatchHistoryItem>;
    return typeof item.id === "string" && !!item.id
        && typeof item.title === "string" && typeof item.image === "string"
        && typeof item.position === "number" && Number.isFinite(item.position) && item.position >= 10
        && typeof item.duration === "number" && Number.isFinite(item.duration) && item.duration > 0
        && item.position < item.duration * 0.95
        && typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt);
}

export function readWatchHistory(key: string): WatchHistoryItem[] {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value)
            ? value.filter(isWatchHistoryItem).sort((first, second) => second.updatedAt - first.updatedAt).slice(0, 30)
            : [];
    } catch {
        return [];
    }
}

function writeWatchHistory(key: string, items: WatchHistoryItem[]): void {
    try {
        localStorage.setItem(key, JSON.stringify(items.slice(0, 30)));
        window.dispatchEvent(new Event(WATCH_HISTORY_EVENT));
    } catch {}
}

export function removeWatchHistoryItem(key: string, id: string): void {
    writeWatchHistory(key, readWatchHistory(key).filter(item => item.id !== id));
}

export function saveWatchProgress(key: string, item: WatchHistoryItem): void {
    if (!Number.isFinite(item.position) || !Number.isFinite(item.duration) || item.duration <= 0) return;
    if (item.position >= item.duration * 0.95) {
        removeWatchHistoryItem(key, item.id);
        return;
    }
    if (!isWatchHistoryItem(item)) return;
    writeWatchHistory(key, [item, ...readWatchHistory(key).filter(previous => previous.id !== item.id)]);
}