"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";

type SfHeroProps = {
  releaseCount: number;
};

export default function SfHero({ releaseCount }: SfHeroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const title = titleRef.current;
    const panel = panelRef.current;

    if (!section || !title || !panel) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const compactMotion = window.matchMedia("(max-width: 720px)").matches;
      const titleLines = gsap.utils.toArray<HTMLElement>(".sf-title-factory, .sf-title-archive");

      gsap.fromTo(
        titleLines,
        { autoAlpha: 0, y: compactMotion ? 34 : 58, scale: 0.96 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.95,
          stagger: 0.1,
          ease: "power3.out"
        }
      );

      gsap.fromTo(
        panel,
        { autoAlpha: 0, y: compactMotion ? 28 : 46, rotate: compactMotion ? 0 : 1 },
        {
          autoAlpha: 1,
          y: 0,
          rotate: compactMotion ? 0 : 2,
          duration: 0.9,
          delay: 0.18,
          ease: "power2.out"
        }
      );

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom top",
          scrub: 0.6
        }
      });

      timeline
        .to(
          title,
          {
            scale: compactMotion ? 1.16 : 1.32,
            x: compactMotion ? -8 : -36,
            y: compactMotion ? -48 : -118,
            ease: "none"
          },
          0
        )
        .to(
          titleLines,
          {
            textShadow: compactMotion
              ? "5px 5px 0 rgba(226, 39, 24, 0.42)"
              : "12px 12px 0 rgba(226, 39, 24, 0.34)",
            ease: "none"
          },
          0
        )
        .to(
          panel,
          {
            x: compactMotion ? 8 : 48,
            y: compactMotion ? -22 : -52,
            scale: compactMotion ? 0.96 : 0.9,
            rotate: compactMotion ? 0 : 5,
            autoAlpha: compactMotion ? 0.72 : 0.58,
            ease: "none"
          },
          0.06
        );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="sf-hero" aria-labelledby="sf-title">
      <div className="sf-hero-copy">
        <h1 ref={titleRef} id="sf-title">
          <span className="sf-title-factory">STRANGE FACTORY</span>
          <span className="sf-title-archive">ARCHIVE</span>
        </h1>
      </div>

      <div ref={panelRef} className="sf-hero-panel" aria-label="아카이브 요약">
        <span>CATALOG</span>
        <strong>{releaseCount}</strong>
        <p>released tracks</p>
      </div>
    </section>
  );
}
