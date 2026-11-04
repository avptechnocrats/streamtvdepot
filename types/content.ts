/**
 * Shared content types used across all themes.
 * Every theme's ContentRow component must accept these props,
 * ensuring data flows consistently regardless of which theme is active.
 */

export interface Movie {
    title: string;
    image: string;
    year: string;
    rating: string;
    categories?: string[];
    ageRating?: string | null;
    duration?: number | null;
    classification?: string | null;
    previewImage?: string | null;
    videoUrl?: string | null;
    hlsUrl?: string | null;
    trailerUrl?: string | null;
    trailerHlsUrl?: string | null;
    id?: string; // Add id for linking
}

export interface ContentRowProps {
    title: string;
    movies: Movie[];
    variant?: "portrait" | "landscape" | "featured" | "wider-landscape";
    /** Optional link to the full category page (used by themes that render a "View All" action). */
    href?: string;
}
