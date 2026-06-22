"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const title = titleRef.current;
    const sub = subRef.current;
    const note = noteRef.current;

    if (!section || !title || !sub || !note) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const compactMotion = window.matchMedia("(max-width: 720px)").matches;

      gsap.fromTo(
        title,
        { autoAlpha: 0, y: 56 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 1.2,
          ease: "power3.out"
        }
      );

      gsap.fromTo(
        [sub, note],
        { autoAlpha: 0.72, y: 28 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.9,
          ease: "power2.out",
          stagger: 0.15,
          delay: 0.25
        }
      );

      gsap
        .timeline({
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: "bottom top",
            scrub: 0.6
          }
        })
        .to(
          title,
          {
            scale: compactMotion ? 1.24 : 1.58,
            y: compactMotion ? -74 : -174,
            x: compactMotion ? -10 : -42,
            textShadow: compactMotion
              ? "4px 4px 0 rgba(136, 189, 242, 0.55)"
              : "10px 10px 0 rgba(136, 189, 242, 0.52)",
            ease: "none"
          },
          0
        )
        .to(sub, { y: compactMotion ? -48 : -88, autoAlpha: 0.28, ease: "none" }, 0.04)
        .to(note, { y: compactMotion ? -30 : -52, autoAlpha: 0, ease: "none" }, 0.12);
    });

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="hero-section" aria-labelledby="hero-title">
      <div className="hero-grid" aria-hidden="true" />

      <div className="hero-content">
        <div className="hero-poster" aria-hidden="true">
          <div className="hero-poster-seal">
            <img src="/ranch-seal.svg" alt="" />
            <video
              className="hero-poster-video"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
            >
              <source src="/hanma.mp4" type="video/mp4" />
            </video>
          </div>
          <span>NO. 0001</span>
        </div>

        <h1 ref={titleRef} id="hero-title" className="hero-title">
          무적의 을왕리
        </h1>

        <div ref={subRef} className="hero-copy">
          <p className="hero-kicker">EULWANGNI EDITION</p>
          <p className="hero-date">7월 17일 - 7월 18일</p>
          <p>을왕리에서 열리는 목장 친구들의 강력한 수퍼 페스티벌</p>
        </div>

        <div ref={noteRef} className="hero-actions">
          <a className="primary-button" href="#apply">
            참가 신청하기
          </a>
        </div>
      </div>
    </section>
  );
}
