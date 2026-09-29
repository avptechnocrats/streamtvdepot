"use client";

/**
 * useContentAccess
 *
 * Checks whether the current user has active access to a specific content item
 * (via subscription, PPV, or rental). Safe to call without a logged-in user —
 * returns { hasAccess: false } immediately when unauthenticated.
 *
 * Usage:
 *   const { hasAccess, accessType, expiresAt, loading } = useContentAccess(videoId);
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { checkContentAccess, type ContentAccess } from "@/lib/services/checkout";
import { TOKEN_KEYS } from "@/lib/services";

interface UseContentAccessResult {
    hasAccess: boolean;
    accessType: ContentAccess["access_type"];
    expiresAt: string | null;
    loading: boolean;
    /** Call after a successful purchase to refresh access state */
    refresh: () => void;
}

export function useContentAccess(contentId: string | null | undefined): UseContentAccessResult {
    const [result, setResult] = useState<ContentAccess>({
        has_access: false,
        access_type: null,
        expires_at: null,
    });
    const [loading, setLoading] = useState(false);
    const [epoch, setEpoch] = useState(0);

    const refresh = useCallback(() => setEpoch((e) => e + 1), []);

    // Track the last (contentId, epoch) key that the effect has started processing.
    // This lets us detect the render gap between when contentId becomes non-null and
    // when the effect actually fires — preventing premature "no access" decisions.
    const lastStartedKeyRef = useRef<string>("");
    const currentKey = contentId ? `${contentId}:${epoch}` : "";
    // True when contentId is set but the effect hasn't kicked off the check yet
    const isPendingCheck = Boolean(contentId) && lastStartedKeyRef.current !== currentKey;

    useEffect(() => {
        // Mark this key as started immediately so subsequent renders see loading=true
        lastStartedKeyRef.current = contentId ? `${contentId}:${epoch}` : "";

        if (!contentId) return;

        // If no token stored, skip the request (user not logged in)
        const token =
            typeof window !== "undefined"
                ? localStorage.getItem(TOKEN_KEYS.access)
                : null;
        if (!token) return;

        setLoading(true);
        checkContentAccess(contentId)
            .then(setResult)
            .catch(() => {
                /* treat errors as no access */
            })
            .finally(() => setLoading(false));
    }, [contentId, epoch]);

    return {
        hasAccess: result.has_access,
        accessType: result.access_type,
        expiresAt: result.expires_at,
        loading: loading || isPendingCheck,
        refresh,
    };
}
