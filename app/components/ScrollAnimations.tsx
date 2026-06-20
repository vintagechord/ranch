"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";

export default function ScrollAnimations() {
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      return;
    }

    const compactMotion = window.matchMedia("(max-width: 980px)").matches;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-section-title]").forEach((title) => {
        gsap.fromTo(
          title,
          { autoAlpha: 0, y: 64 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: title,
              start: "top 84%",
              toggleActions: "play none none reverse"
            }
          }
        );
      });

      gsap.utils.toArray<HTMLElement>("[data-program-card]").forEach((card, index) => {
        gsap.fromTo(
          card,
          { autoAlpha: 0, y: 72, scale: 0.96 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.8,
            delay: index * 0.04,
            ease: "power2.out",
            scrollTrigger: {
              trigger: card,
              start: "top 86%",
              toggleActions: "play none none reverse"
            }
          }
        );
      });

      gsap.utils.toArray<HTMLElement>("[data-reveal-card]").forEach((card, index) => {
        gsap.fromTo(
          card,
          { autoAlpha: 0, y: 42, scale: 0.97 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.7,
            delay: index * 0.05,
            ease: "power2.out",
            scrollTrigger: {
              trigger: card,
              start: "top 88%",
              toggleActions: "play none none reverse"
            }
          }
        );
      });

      gsap.utils.toArray<HTMLElement>("[data-schedule-row]").forEach((row, index) => {
        gsap.fromTo(
          row,
          { autoAlpha: 0, x: compactMotion ? 0 : index % 2 === 0 ? -34 : 34, y: 24 },
          {
            autoAlpha: 1,
            x: 0,
            y: 0,
            duration: 0.65,
            ease: "power2.out",
            scrollTrigger: {
              trigger: row,
              start: "top 88%",
              toggleActions: "play none none reverse"
            }
          }
        );
      });
    });

    return () => ctx.revert();
  }, []);

  return null;
}
