import type { AdType } from "@/lib/api";

export type PlacementType = "pre_roll" | "mid_roll" | "post_roll" | "overlay" | "banner" | "sidebar";

export const ALL_PLACEMENT_TYPES: PlacementType[] = [
    "pre_roll",
    "mid_roll",
    "post_roll",
    "overlay",
    "banner",
    "sidebar",
];

/**
 * Single source of truth for how an ad's creative format (`ad_type`) maps to the
 * placement zones (`placement_type`) it can actually be routed to. Mirrors the
 * compatibility rules enforced server-side in `_resolve_video_creatives()`
 * (V2/backend/app/api/v1/public/router.py) so the UI never lets an admin create
 * a combination that would silently fail to resolve at playback.
 */
export const AD_TYPE_META: Record<AdType, { label: string; description: string; placements: PlacementType[] }> = {
    video: {
        label: "Video (in-stream)",
        description: "Linear video creative played inside the player. Usable for Pre-roll, Mid-roll, or Post-roll.",
        placements: ["pre_roll", "mid_roll", "post_roll"],
    },
    banner: {
        label: "Banner (display)",
        description: "Static image or HTML creative shown outside the player. Usable for Banner or Sidebar zones.",
        placements: ["banner", "sidebar"],
    },
    overlay: {
        label: "Overlay (on-player)",
        description: "Semi-transparent creative shown on top of the video while it plays. Usable for the Overlay zone only.",
        placements: ["overlay"],
    },
    popup: {
        label: "Popup (interstitial)",
        description: "Full-screen creative shown between navigation actions. Usable for the Overlay zone only.",
        placements: ["overlay"],
    },
};

export const PLACEMENT_TYPE_META: Record<PlacementType, { label: string; description: string }> = {
    pre_roll: { label: "Pre-roll", description: "Plays before the video starts" },
    mid_roll: { label: "Mid-roll", description: "Plays during the video at a cue point" },
    post_roll: { label: "Post-roll", description: "Plays after the video ends" },
    overlay: { label: "Overlay", description: "Shown on top of the player while content plays" },
    banner: { label: "Banner", description: "Static display zone near the player" },
    sidebar: { label: "Sidebar", description: "Static display zone beside the content" },
};
