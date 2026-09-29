"use client";

import { Play, Plus, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useUserPrefs } from "@/hooks/use-user-prefs";


interface Movie {
  id?: string;
  title: string;
  image: string;
  year: string;
  rating: string;
}


interface ContentRowProps {
  title: string;
  movies: Movie[];
}


const GENRES = ["Action", "Drama", "Thriller", "Sci-Fi", "Mystery", "Adventure"];
const DESCS = [
  "A gripping story that will keep you on the edge of your seat from start to finish.",
  "Breathtaking visuals paired with a deeply emotional narrative.",
  "An unforgettable journey packed with twists you never saw coming.",
  "Outstanding performances elevate this must-watch masterpiece.",
];


function DefaultCard({ movie, i }: { movie: Movie; i: number }) {
  return (
    <Link
      key={movie.id || `${movie.title}-${i}`}
      href={movie.id ? `/movies/${movie.id}` : "#"}
      className="content-card flex-shrink-0 group/card cursor-pointer"
      tabIndex={0}
    >
      <div className="relative rounded-lg overflow-hidden card-shine aspect-[2/3] bg-secondary">
        <Image
          src={movie.image}
          alt={movie.title}
          fill
          className="object-cover transition-transform duration-300 group-hover/card:scale-105"
          sizes="(max-width: 640px) 50vw, 170px"
        />
        <div className="absolute inset-0 bg-background/0 group-hover/card:bg-background/40 transition-colors flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all scale-75 group-hover/card:scale-100">
            <Play size={20} className="text-primary-foreground ml-0.5" fill="currentColor" />
          </div>
        </div>
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="text-sm font-medium text-foreground truncate">{movie.title}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{movie.year}</span>
          <span className="text-primary">{movie.rating}</span>
        </div>
      </div>
    </Link>
  );
}

function DetailedCard({ movie, i }: { movie: Movie; i: number }) {
  const genre = GENRES[i % GENRES.length];
  const desc = DESCS[i % DESCS.length];
  return (
    <Link
      key={movie.id || `${movie.title}-${i}`}
      href={movie.id ? `/movies/${movie.id}` : "#"}
      className="content-card flex-shrink-0 group/card cursor-pointer"
      tabIndex={0}
    >
      <div className="relative rounded-lg overflow-hidden card-shine aspect-[2/3] bg-secondary">
        <Image
          src={movie.image}
          alt={movie.title}
          fill
          className="object-cover transition-transform duration-500 group-hover/card:scale-110"
          sizes="(max-width: 640px) 50vw, 170px"
        />

        {/* Detailed overlay — slides up on hover */}
        <div className="absolute inset-0 flex flex-col justify-end translate-y-full group-hover/card:translate-y-0 transition-transform duration-300 ease-out">
          {/* gradient backing */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/90 to-transparent" />

          <div className="relative p-3 space-y-2">
            {/* Genre tag */}
            <span className="inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-primary/20 text-primary border border-primary/30 rounded-full">
              {genre}
            </span>

            {/* Title */}
            <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{movie.title}</p>

            {/* Meta row */}
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{movie.year}</span>
              <span className="flex items-center gap-0.5 text-primary font-medium">
                <Star size={10} fill="currentColor" />{movie.rating.replace("★ ", "")}
              </span>
            </div>

            {/* Description */}
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{desc}</p>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
                <Play size={11} fill="currentColor" /> Watch
              </button>
              <button className="p-1.5 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors">
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Below-card info — visible when not hovered */}
      <div className="mt-2 space-y-0.5">
        <p className="text-sm font-medium text-foreground truncate">{movie.title}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{movie.year}</span>
          <span className="text-primary">{movie.rating}</span>
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-border/50">{genre}</span>
        </div>
      </div>
    </Link>
  );
}

const ContentRow = ({ title, movies }: ContentRowProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { prefs } = useUserPrefs();

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === "left" ? -400 : 400, behavior: "smooth" });
    }
  };

  return (
    <section className="px-6 lg:px-12 space-y-4">
      <h3 className="text-lg md:text-xl font-display font-700 text-foreground">
        {title}
      </h3>
      <div className="relative group">
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-0 bottom-0 z-10 w-10 bg-background/60 backdrop-blur-sm flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronLeft size={24} />
        </button>
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide py-2 px-1"
        >
          {movies.map((movie, i) =>
            prefs.cardStyle === "detailed"
              ? <DetailedCard key={movie.id || movie.title + i} movie={movie} i={i} />
              : <DefaultCard key={movie.id || movie.title + i} movie={movie} i={i} />
          )}
        </div>
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-0 bottom-0 z-10 w-10 bg-background/60 backdrop-blur-sm flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    </section>
  );
};

export default ContentRow;

