/**
 * ember/index.ts
 *
 * Full-layout theme modelled on a dark streaming-portal design: solid top bar
 * with inline search, compact hero slider, poster rails with hover quick
 * actions, and a sign-up call-to-action footer.
 */
import type { ThemeComponents } from "@/themes/types";

import Navbar from "./Navbar";
import Banner from "./Banner";
import ContentRow from "./ContentRow";
import CategoryGrid from "./CategoryGrid";
import Footer from "./Footer";

const emberComponents: ThemeComponents = {
    Navbar,
    Banner,
    ContentRow,
    CategoryGrid,
    Footer,
};

export default emberComponents;
