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
}

export interface ContentRowProps {
    title: string;
    movies: Movie[];
}
