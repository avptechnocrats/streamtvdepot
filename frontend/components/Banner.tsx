"use client";

import { Play, Plus, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { useBannerVideos, type BannerSlide } from "@/hooks/use-banner-videos";
import { BannerSkeleton } from "@/components/BannerSkeleton";
import { useEffect, useState, useCallback } from "react";

type SlideData = {
  image: string; badge: string; titleA: string; titleB: string;
  desc: string; match: string; year: string; formats: string[]; duration: string;
  videoUrl: string | null;
};

function mapToSlide(s: BannerSlide): SlideData {
  return {
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
    <section className="relative w-full h-[85vh] min-h-[500px] overflow-hidden">
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
        className="absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full bg-background/40 backdrop-blur-sm border border-border/50 text-foreground hover:bg-background/70 transition-colors"
        aria-label="Previous slide"
      >
        <ChevronLeft size={22} />
      </button>
      <button
        onClick={next}
        className="absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full bg-background/40 backdrop-blur-sm border border-border/50 text-foreground hover:bg-background/70 transition-colors"
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
  return (
    <div className="absolute bottom-0 left-0 right-0 px-6 lg:px-12 pb-20 space-y-5">
      <span className="inline-block px-3 py-1 text-xs font-semibold tracking-wider uppercase bg-primary/20 text-primary border border-primary/30 rounded-full animate-fade-in">
        {slide.badge}
      </span>
      <h2 className="text-4xl md:text-6xl lg:text-7xl font-display font-800 leading-tight max-w-2xl animate-fade-in text-white" style={{ animationDelay: "0.1s" }}>
        {slide.titleA} <span className="text-gradient-gold">{slide.titleB}</span>
      </h2>
      <p className="text-white/70 text-sm md:text-base max-w-lg leading-relaxed animate-fade-in" style={{ animationDelay: "0.2s" }}>
        {slide.desc}
      </p>
      <div className="flex items-center gap-3 animate-fade-in" style={{ animationDelay: "0.3s" }}>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-6 py-3 h-auto text-base gap-2">
          <Play size={18} fill="currentColor" /> Watch Now
        </Button>
        <Button variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 font-medium px-5 py-3 h-auto text-base gap-2">
          <Plus size={18} /> My List
        </Button>
        <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 p-3 h-auto">
          <Info size={18} />
        </Button>
      </div>
      <div className="flex items-center gap-4 text-xs text-white/90 animate-fade-in" style={{ animationDelay: "0.4s" }}>
        <span className="text-primary font-semibold">{slide.match} Match</span>
        <span>{slide.year}</span>
        {slide.formats.map((f) => (
          <span key={f} className="px-1.5 py-0.5 border border-white/40 rounded text-[10px]">{f}</span>
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

  const slides = apiSlides.map(mapToSlide);
  if (prefs.bannerStyle === "video") return <VideoBanner slides={slides} />;
  if (prefs.bannerStyle === "slider") return <SliderBanner slides={slides} />;
  return <StaticBanner slides={slides} />;
};

export default Banner;

