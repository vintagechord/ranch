"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";

const phrases = ["을왕리로", "모이고", "해지면", "영화보고", "마시고", "아침까지", "못감"];

export default function PinnedCopy() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;

    if (!section || !stage) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const compactLayout = window.matchMedia("(max-width: 720px)").matches;

    if (reduceMotion || compactLayout) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const words = gsap.utils.toArray<HTMLElement>(".pin-word");
      const step = 0.74;
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "+=1900",
          scrub: 0.45,
          pin: stage,
          anticipatePin: 1
        }
      });

      gsap.set(words, { autoAlpha: 0, y: 96, scale: 0.82 });
      gsap.set(words[0], { autoAlpha: 1, y: 0, scale: 1 });

      words.forEach((word, index) => {
        const position = index * step;

        if (index > 0) {
          timeline.to(
            word,
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: 0.24,
              ease: "power2.out"
            },
            position
          );
        }

        timeline.to(
          word,
          {
            autoAlpha: 0,
            y: -80,
            scale: 1.14,
            duration: 0.24,
            ease: "power2.in"
          },
          position + 0.48
        );
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="pinned-copy-section" aria-label="파티를 이루는 말들">
      <div ref={stageRef} className="pinned-stage">
        <div className="pin-words">
          {phrases.map((phrase) => (
            <p key={phrase} className="pin-word">
              {phrase}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
