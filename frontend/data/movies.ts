/**
 * Static movie data — extracted from the page so every theme's
 * ContentRow components can import the same dataset.
 *
 * In a real app these would come from an API/database via React Query or
 * server components. Replace these arrays with your data-fetching logic
 * without touching any theme files.
 */
import type { Movie } from "@/types/content";

export const trendingMovies: Movie[] = [
    { title: "Shadow Walker", image: "/images/movie-1.jpg", year: "2024", rating: "★ 9.2" },
    { title: "Kingdom's Fall", image: "/images/movie-2.jpg", year: "2024", rating: "★ 8.8" },
    { title: "Deep Abyss", image: "/images/movie-3.jpg", year: "2023", rating: "★ 8.5" },
    { title: "Night Detective", image: "/images/movie-4.jpg", year: "2024", rating: "★ 9.0" },
    { title: "Beyond Stars", image: "/images/movie-5.jpg", year: "2024", rating: "★ 8.7" },
    { title: "Lost Temple", image: "/images/movie-6.jpg", year: "2023", rating: "★ 8.9" },
    { title: "Shadow Walker II", image: "/images/movie-1.jpg", year: "2024", rating: "★ 8.3" },
    { title: "Kingdom's Rise", image: "/images/movie-2.jpg", year: "2024", rating: "★ 8.6" },
];

export const newReleases: Movie[] = [
    { title: "Lost Temple", image: "/images/movie-6.jpg", year: "2024", rating: "★ 9.1" },
    { title: "Beyond Stars", image: "/images/movie-5.jpg", year: "2024", rating: "★ 8.4" },
    { title: "Night Detective", image: "/images/movie-4.jpg", year: "2024", rating: "★ 8.8" },
    { title: "Deep Abyss II", image: "/images/movie-3.jpg", year: "2024", rating: "★ 8.2" },
    { title: "Kingdom's Fall", image: "/images/movie-2.jpg", year: "2024", rating: "★ 8.9" },
    { title: "Shadow Walker", image: "/images/movie-1.jpg", year: "2024", rating: "★ 9.0" },
    { title: "Lost Temple II", image: "/images/movie-6.jpg", year: "2024", rating: "★ 8.5" },
    { title: "Beyond Stars II", image: "/images/movie-5.jpg", year: "2024", rating: "★ 8.7" },
];

export const topRated: Movie[] = [
    { title: "Night Detective", image: "/images/movie-4.jpg", year: "2023", rating: "★ 9.5" },
    { title: "Shadow Walker", image: "/images/movie-1.jpg", year: "2023", rating: "★ 9.3" },
    { title: "Kingdom's Fall", image: "/images/movie-2.jpg", year: "2023", rating: "★ 9.1" },
    { title: "Beyond Stars", image: "/images/movie-5.jpg", year: "2023", rating: "★ 9.0" },
    { title: "Deep Abyss", image: "/images/movie-3.jpg", year: "2023", rating: "★ 8.9" },
    { title: "Lost Temple", image: "/images/movie-6.jpg", year: "2023", rating: "★ 8.8" },
    { title: "Night Detective II", image: "/images/movie-4.jpg", year: "2023", rating: "★ 8.7" },
    { title: "Shadow Walker III", image: "/images/movie-1.jpg", year: "2023", rating: "★ 8.6" },
];
