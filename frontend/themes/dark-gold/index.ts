/**
 * dark-gold/index.ts
 *
 * The "Dark Gold" theme component set — and the shared base for all
 * colour-only themes (Midnight, Sunset, Emerald, Cinema Red).
 *
 * These themes look different from each other only through CSS variable
 * overrides defined in globals.css. Their HTML structure and layout are
 * identical because they all reference this same component set.
 *
 * This is equivalent to WordPress's "parent theme" concept — colour-only
 * themes are like child themes that inherit the parent's templates.
 */
import type { ThemeComponents } from "@/themes/types";

import Navbar from "@/components/Navbar";
import Banner from "@/components/Banner";
import ContentRow from "@/components/ContentRow";
import CategoryGrid from "@/components/CategoryGrid";
import Footer from "@/components/Footer";

const darkGoldComponents: ThemeComponents = {
    Navbar,
    Banner,
    ContentRow,
    CategoryGrid,
    Footer,
};

export default darkGoldComponents;
