"use client";

import { Play, Plus, Check, Info, ChevronLeft, ChevronRight, Film, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { useBannerVideos, type BannerSlide } from "@/hooks/use-banner-videos";
import { BannerSkeleton } from "@/components/BannerSkeleton";
import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { useAuth } from "@/hooks/use-auth";
import { addToWatchlist, removeFromWatchlist, getWatchlist, type WatchlistItem } from "@/lib/services/watchlist";
import { toast } from "@/hooks/use-toast";

type SlideData = {
  id: string; image: string; badge: string; titleA: string; titleB: string;
  desc: string; match: string; year: string; formats: string[]; duration: string;
  videoUrl: string | null;
};

/**
 * Shown when the tenant has no banner/slider videos yet.
 * Displays the theme styling correctly so the client can see how their
 * site will look once content is added.
 */
function EmptyBanner() {
  const { site_title, tagline } = useSiteSettings();
  return (
    <section className="relative w-full h-[85vh] min-h-[500px] flex items-center justify-center bg-gradient-to-br from-background via-background/95 to-muted overflow-hidden">
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
        backgroundSize: "40px 40px"
      }} />
      <div className="relative z-10 text-center px-6 max-w-2xl space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Film className="text-primary" size={36} />
          </div>
        </div>
        <h1 className="text-4xl md:text-6xl font-display font-bold text-foreground">
          {site_title ?? "Your Platform"}
        </h1>
        <p className="text-muted-foreground text-lg">
          {tagline ?? "Your content will appear here once uploaded."}
        </p>
        <p className="text-muted-foreground/60 text-sm">
          Upload videos and mark them as featured to see them in the banner.
        </p>
      </div>
      <div className="banner-bottom-fade absolute inset-0 pointer-events-none" />
    </section>
  );
}

function mapToSlide(s: BannerSlide): SlideData {
  return {
    id: s.id,
    image: s.image,
    badge: `★ ${s.classification}`,
    titleA: s.titleA,
    titleB: s.titleB,
    desc: s.description,
    match: s.raw.rating ? `${Math.round(s.raw.rating * 10)}%` : "—",
    year: s.year,
    formats: ["4K"],
    duration: s.duration,
    videoUrl: s.videoUrl,
  };
}

function StaticBanner({ slides }: { slides: SlideData[] }) {
  const slide = slides[0];
  return (
    <section className="relative w-full h-[85vh] min-h-[500px]">
      <img src={slide.image} alt="Featured movie" className="absolute inset-0 w-full h-full object-cover" width={1920} height={800} />
      <div className="banner-overlay absolute inset-0" />
      <div className="banner-bottom-fade absolute inset-0 pointer-events-none" />
      <BannerContent slide={slide} />
    </section>
  );
}

function SliderBanner({ slides }: { slides: SlideData[] }) {
  const [current, setCurrent] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  const goTo = useCallback((idx: number) => {
    if (transitioning) return;
    setTransitioning(true);
    setTimeout(() => {
      setCurrent(idx);
      setTransitioning(false);
    }, 300);
  }, [transitioning]);

  const prev = () => goTo((current - 1 + slides.length) % slides.length);
  const next = useCallback(() => goTo((current + 1) % slides.length), [current, goTo, slides.length]);

  // Auto-advance every 6s
  useEffect(() => {
    const t = setTimeout(next, 6000);
    return () => clearTimeout(t);
  }, [current, next]);

  const slide = slides[current];

  return (
    <section className="relative w-full h-[85vh] min-h-[500px] overflow-hidden group">
      {/* Slide images — fade transition */}
      {slides.map((s, i) => (
        <img
          key={i}
          src={s.image}
          alt={`${s.titleA} ${s.titleB}`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${i === current ? "opacity-100" : "opacity-0"}`}
          width={1920}
          height={800}
        />
      ))}
      <div className="banner-overlay absolute inset-0" />
      <div className="banner-bottom-fade absolute inset-0 pointer-events-none" />

      {/* Content — fades with slide */}
      <div className={`transition-opacity duration-300 ${transitioning ? "opacity-0" : "opacity-100"}`}>
        <BannerContent slide={slide} />
      </div>

      {/* Prev / Next arrows */}
      <button
        onClick={prev}
        className="absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full bg-background/40 backdrop-blur-sm border border-border/50 text-foreground hover:bg-background/70 transition-all opacity-0 group-hover:opacity-100"
        aria-label="Previous slide"
      >
        <ChevronLeft size={22} />
      </button>
      <button
        onClick={next}
        className="absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full bg-background/40 backdrop-blur-sm border border-border/50 text-foreground hover:bg-background/70 transition-all opacity-0 group-hover:opacity-100"
        aria-label="Next slide"
      >
        <ChevronRight size={22} />
      </button>

      {/* Dot indicators */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`transition-all duration-300 rounded-full ${i === current ? "w-6 h-2 bg-primary" : "w-2 h-2 bg-foreground/40 hover:bg-foreground/70"}`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Slide count */}
      <div className="absolute bottom-6 right-6 lg:right-12 text-xs text-muted-foreground font-medium tabular-nums z-10">
        {current + 1} / {slides.length}
      </div>
    </section>
  );
}

function BannerContent({ slide }: { slide: SlideData }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: watchlist = [] } = useQuery({
    queryKey: ["watchlist"],
    queryFn: getWatchlist,
    enabled: !!user,
    staleTime: 60_000,
  });
  const isInWatchlist = watchlist.some((i) => i.video_id === slide.id);
  const watchlistMutation = useMutation<void | WatchlistItem>({
    mutationFn: () => isInWatchlist ? removeFromWatchlist(slide.id) : addToWatchlist(slide.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      toast({ title: isInWatchlist ? "Removed from My List" : "Added to My List" });
    },
    onError: () => toast({ title: "Couldn't update your list", variant: "destructive" }),
  });
  const textShadow = "0 1px 6px rgba(0,0,0,0.9), 0 3px 16px rgba(0,0,0,0.7)";
  return (
    <div className="absolute bottom-0 left-0 right-0 px-6 lg:px-12 pb-20 space-y-5">
      <span className="inline-block px-3 py-1 text-xs font-semibold tracking-wider uppercase bg-primary/20 text-primary border border-primary/30 rounded-full animate-fade-in backdrop-blur-sm">
        {slide.badge}
      </span>
      <h2 className="text-4xl md:text-6xl lg:text-7xl font-display font-800 leading-tight max-w-2xl animate-fade-in text-white" style={{ animationDelay: "0.1s", textShadow }}>
        {slide.titleA} <span className="text-gradient-gold">{slide.titleB}</span>
      </h2>
      <p className="text-white/90 text-sm md:text-base max-w-lg leading-relaxed animate-fade-in" style={{ animationDelay: "0.2s", textShadow }}>
        {slide.desc}
      </p>
      <div className="flex items-center gap-3 animate-fade-in" style={{ animationDelay: "0.3s" }}>
        <Link href={`/movies/${slide.id}?play=true`}>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-6 py-3 h-auto text-base gap-2">
            <Play size={18} fill="currentColor" /> Watch Now
          </Button>
        </Link>
        <Button variant="outline" onClick={() => watchlistMutation.mutate()} disabled={watchlistMutation.isPending} className="bg-black/30 backdrop-blur-sm border-white/50 text-white hover:bg-white/15 font-medium px-5 py-3 h-auto text-base gap-2">
          {watchlistMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : isInWatchlist ? <Check size={18} /> : <Plus size={18} />}
          {isInWatchlist ? "In My List" : "My List"}
        </Button>
        <Button variant="ghost" className="text-white hover:text-white hover:bg-white/15 p-3 h-auto backdrop-blur-sm">
          <Info size={18} />
        </Button>
      </div>
      <div className="flex items-center gap-4 text-xs text-white animate-fade-in" style={{ animationDelay: "0.4s", textShadow }}>
        <span className="text-primary font-semibold drop-shadow-md">{slide.match} Match</span>
        <span>{slide.year}</span>
        {slide.formats.map((f) => (
          <span key={f} className="px-1.5 py-0.5 border border-white/60 rounded text-[10px] bg-black/20 backdrop-blur-sm">{f}</span>
        ))}
        <span>{slide.duration}</span>
      </div>
    </div>
  );
}

function VideoBanner({ slides }: { slides: SlideData[] }) {
  const slide = slides[0];
  const videoSrc = slide.videoUrl;
  return (
    <section className="relative w-full h-[85vh] min-h-[500px] overflow-hidden">
      {videoSrc ? (
        <video
          autoPlay
          muted
          loop
          playsInline
          poster={slide.image}
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
      ) : (
        <img src={slide.image} alt="Featured movie" className="absolute inset-0 w-full h-full object-cover" width={1920} height={800} />
      )}
      <div className="banner-overlay absolute inset-0" />
      <div className="banner-bottom-fade absolute inset-0 pointer-events-none" />
      <BannerContent slide={slide} />
    </section>
  );
}

const Banner = () => {
  const { prefs, prefsReady } = useUserPrefs();
  const { slides: apiSlides, isLoading } = useBannerVideos();

  if (isLoading || !prefsReady) return <BannerSkeleton />;
  if (apiSlides.length === 0) return <EmptyBanner />;

  const slides = apiSlides.map(mapToSlide);
  if (prefs.bannerStyle === "video") return <VideoBanner slides={slides} />;
  if (prefs.bannerStyle === "slider") return <SliderBanner slides={slides} />;
  return <StaticBanner slides={slides} />;
};

export default Banner;

