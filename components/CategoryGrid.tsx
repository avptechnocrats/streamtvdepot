"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fetchCategories, getCategoryImageUrl, type Category } from "@/lib/services";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import type { CarouselApi } from "@/components/ui/carousel";

// Deterministic colour gradient fallback keyed by first char of name
const GRADIENTS = [
  "from-red-800/80 to-orange-900/80",
  "from-blue-800/80 to-indigo-900/80",
  "from-emerald-800/80 to-teal-900/80",
  "from-purple-800/80 to-violet-900/80",
  "from-amber-700/80 to-orange-800/80",
  "from-cyan-800/80 to-sky-900/80",
  "from-rose-800/80 to-pink-900/80",
  "from-lime-800/80 to-green-900/80",
];

function fallbackGradient(name: string): string {
  return GRADIENTS[name.charCodeAt(0) % GRADIENTS.length];
}

const CategoryGrid = ({ type, showName = true }: { type: string; showName?: boolean }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [api, setApi] = useState<CarouselApi>();

  useEffect(() => {
    fetchCategories(type)
      .then((cats) => {
        setCategories(cats);
      })
      .catch(() => { });
  }, [type]);

  if (!categories.length) return null;

  const scroll = (direction: "left" | "right") => {
    if (api) {
      if (direction === "left") {
        api.scrollPrev();
      } else {
        api.scrollNext();
      }
    }
  };

  return (
    <section className="px-6 lg:px-12 space-y-4">
      <h3 className="text-lg md:text-xl font-display font-700 text-foreground">
        Browse by Category
      </h3>
      <div className="relative group">
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-0 bottom-0 z-10 w-10 bg-background/60 backdrop-blur-sm flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronLeft size={24} />
        </button>
        <Carousel
          opts={{
            align: "start",
            loop: false,
          }}
          setApi={setApi}
          className="w-full"
        >
          <CarouselContent className="ml-0">
            {categories.map((cat) => {
              const imgUrl = getCategoryImageUrl(cat);
              return (
                <CarouselItem key={cat.id} className="pl-4 basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5 xl:basis-1/6">
                  <Link
                    href={`/categories/${cat.slug}`}
                    className="relative overflow-hidden rounded-xl border border-border/50 hover:border-primary/40 hover:scale-105 transition-all cursor-pointer aspect-[3/2] group block h-full"
                  >
                    {imgUrl ? (
                      <div
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                        style={{ backgroundImage: `url(${imgUrl})` }}
                      />
                    ) : (
                      <div className={`absolute inset-0 bg-gradient-to-br ${fallbackGradient(cat.name)}`} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    {showName && (
                      <span className="absolute bottom-0 left-0 right-0 px-3 pb-2.5 text-sm font-semibold text-white text-left leading-tight">
                        {cat.name}
                      </span>
                    )}
                  </Link>
                </CarouselItem>
              );
            })}
          </CarouselContent>
        </Carousel>
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

export default CategoryGrid;
