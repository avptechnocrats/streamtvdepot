"use client";

/**
 * usePlayGate
 *
 * Encapsulates all access-gating logic for a content item.
 *
 * Returns a `handlePlay` callback that, when called, will:
 *   - Free content           → always call `onPlay()`
 *   - Not logged in          → redirect to /login?returnTo=<currentPath>
 *   - Subscription content   → check access; no sub → redirect to /pricing; has access → onPlay()
 *   - Rent content           → check access; no access → navigate to /checkout?type=rent; has access → onPlay()
 *   - PPV content            → check access; no access → navigate to /checkout?type=ppv;  has access → onPlay()
 */

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useContentAccess } from "@/hooks/use-content-access";

export type ContentAccessType = "free" | "subscription" | "pay_per_view" | "rental";

interface UsePlayGateOptions {
    contentId: string;
    accessType: ContentAccessType;
    contentTitle?: string;
    /** Called when the user is allowed to play */
    onPlay: () => void;
}

export function usePlayGate({
    contentId,
    accessType,
    contentTitle = "this content",
    onPlay,
}: UsePlayGateOptions) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const { hasAccess, loading: accessLoading } = useContentAccess(
        accessType !== "free" && !!user ? contentId : null,
    );

    const handlePlay = useCallback(() => {
        const returnTo = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

        // ── Free content → always play ────────────────────────────────────────
        if (accessType === "free") {
            onPlay();
            return;
        }

        // ── Not logged in → redirect to login with returnTo ───────────────────
        if (!user) {
            router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
            return;
        }

        // ── Still loading access check → wait ─────────────────────────────────
        if (accessLoading) return;

        // ── Already has access → play ──────────────────────────────────────────
        if (hasAccess) {
            onPlay();
            return;
        }

        // ── Subscription required → go to pricing page ────────────────────────
        if (accessType === "subscription") {
            router.push(`/pricing?returnTo=${encodeURIComponent(returnTo)}`);
            return;
        }

        // ── Rent → navigate to checkout page ─────────────────────────────────
        if (accessType === "rental") {
            router.push(
                `/checkout?type=rent&contentId=${encodeURIComponent(contentId)}&returnTo=${encodeURIComponent(returnTo)}`,
            );
            return;
        }

        // ── PPV → navigate to checkout page ──────────────────────────────────
        if (accessType === "pay_per_view") {
            router.push(
                `/checkout?type=ppv&contentId=${encodeURIComponent(contentId)}&returnTo=${encodeURIComponent(returnTo)}`,
            );
            return;
        }
    }, [accessType, user, accessLoading, hasAccess, onPlay, router, pathname, searchParams, contentId]);

    return {
        handlePlay,
        hasAccess,
        accessLoading: accessType !== "free" && !!user && accessLoading,
    };
}
