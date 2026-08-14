"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "morning-ranch-motion-paused";

export default function MotionToggle() {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const storedPaused = window.localStorage.getItem(STORAGE_KEY) === "true";
    setPaused(storedPaused);
    document.documentElement.classList.toggle("site-motion-paused", storedPaused);
    window.dispatchEvent(
      new CustomEvent("morning-ranch-motion-change", { detail: { paused: storedPaused } })
    );
  }, []);

  function toggleMotion() {
    const nextPaused = !paused;
    setPaused(nextPaused);
    window.localStorage.setItem(STORAGE_KEY, String(nextPaused));
    document.documentElement.classList.toggle("site-motion-paused", nextPaused);
    window.dispatchEvent(
      new CustomEvent("morning-ranch-motion-change", { detail: { paused: nextPaused } })
    );
  }

  return (
    <button
      type="button"
      className="header-motion-toggle"
      aria-label={paused ? "사이트 모션 켜기" : "사이트 모션 끄기"}
      aria-pressed={paused}
      title={paused ? "모션 켜기" : "모션 끄기"}
      onClick={toggleMotion}
    >
      <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
    </button>
  );
}
