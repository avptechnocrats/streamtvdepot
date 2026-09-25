/**
 * apple-tv/index.ts
 *
 * Apple TV+ inspired theme component set.
 *
 * Visual identity: pure black, cinematic minimal — no glows, no neon,
 * no monospace brackets. Clean rounded geometry, white pill buttons,
 * portrait poster cards, understated category pills.
 *
 *   Navbar       — gradient-black fade, play-icon logo, title-case nav
 *   Banner   — left-aligned, white pill buttons, clean typography
 *   ContentRow   — portrait 2:3 poster cards, scale-hover, play overlay
 *   CategoryGrid — horizontal rounded-full pills, primary-fill active
 *   Footer       — ultra-minimal, play icon + links + copyright
 */
import type { ThemeComponents } from "@/themes/types";

import Navbar from "./Navbar";
import Banner from "./Banner";
import ContentRow from "./ContentRow";
import CategoryGrid from "./CategoryGrid";
import Footer from "./Footer";

const appleTvComponents: ThemeComponents = {
    Navbar,
    Banner,
    ContentRow,
    CategoryGrid,
    Footer,
};

export default appleTvComponents;
