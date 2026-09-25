/**
 * neon-city/index.ts
 *
 * Neon City theme component set.
 *
 * This is the entry point for the "Neon City" theme — equivalent to
 * WordPress's theme folder index. All 5 components are custom-built for
 * this theme with a cyberpunk/gaming aesthetic:
 *
 *   Navbar      — transparent + glow border + underline-active nav
 *   Banner  — always-slider + scan-line overlay + centered neon content
 *   ContentRow  — landscape 16:9 cards (not portrait)
 *   CategoryGrid — horizontal scrollable pill/tab row (not a grid)
 *   Footer      — compact single-row monospace layout
 */
import type { ThemeComponents } from "@/themes/types";

import Navbar from "./Navbar";
import Banner from "./Banner";
import ContentRow from "./ContentRow";
import CategoryGrid from "./CategoryGrid";
import Footer from "./Footer";

const neonCityComponents: ThemeComponents = {
    Navbar,
    Banner,
    ContentRow,
    CategoryGrid,
    Footer,
};

export default neonCityComponents;
