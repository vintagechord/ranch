"use client";

import { MouseEvent, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import PiggyBankButton from "@/app/components/PiggyBankButton";

const homeNavItems = [
  { label: "PROGRAM", hash: "#program" },
  { label: "APPLY", hash: "#apply" },
  { label: "INFO", hash: "#venue" }
];

const pageNavItems = [{ label: "참가자", href: "/participants" }];

const MAX_HEADER_COWS = 5;
const HEADER_HERD_HALF_CYCLE_MS = 7500;
type HeaderHerdMode = "filling" | "emptying";

function scrollToHash(event: MouseEvent<HTMLAnchorElement>, href: string) {
  const url = new URL(href, window.location.href);

  if (!url.hash || url.pathname !== window.location.pathname) {
    return;
  }

  const target = document.querySelector(url.hash);

  if (!target) {
    return;
  }

  event.preventDefault();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  window.history.pushState(null, "", url.hash);
}

type HeaderProps = {
  showApplyCta?: boolean;
};

function HeaderCow({ index }: { index: number }) {
  return (
    <svg
      className="header-cow"
      viewBox="0 0 48 32"
      focusable="false"
      style={{ left: `${48 + index * 22}px` }}
    >
      <path className="header-cow-tail" d="M39 14c5-5 8-5 8-2.2 0 2.1-2.3 3.3-6.4 3.4" />
      <path className="header-cow-body" d="M11 12.4c3-5 15.8-5.8 24.3-1.4 5.2 2.7 6.5 7.9 3.4 11.2-3.5 3.6-17.6 3.5-25.7-.2-4.6-2.1-5.3-6.2-2-9.6Z" />
      <path className="header-cow-head" d="M11.6 10.3C7.8 6 2.6 7.8 1.8 12.8c-.8 5.4 3.3 9.4 8.3 8 4.8-1.3 5.3-6.3 1.5-10.5Z" />
      <path className="header-cow-horn" d="M4.8 8.4 2.2 5.2M11.8 8.1 14.6 5" />
      <path className="header-cow-leg header-cow-leg-front" d="M15.2 23.5 13.7 30h4.6" />
      <path className="header-cow-leg header-cow-leg-back" d="M33.7 23.7 35.8 30h-4.7" />
      <circle className="header-cow-eye" cx="6.8" cy="13.7" r="1.05" />
      <path className="header-cow-nose" d="M1.6 16.4c1.8-.5 3.8-.2 5.2.8" />
    </svg>
  );
}

function SfFactoryLink({ isActive }: { isActive: boolean }) {
  return (
    <a
      className={`sf-factory-link${isActive ? " is-active" : ""}`}
      href="/sf"
      aria-label="S/F 음원 아카이브로 이동"
    >
      <svg viewBox="0 0 36 36" focusable="false" aria-hidden="true">
        <path className="sf-factory-smoke" d="M24.2 5.8c2.7-1.8 5.4-.5 4.6 1.9-.6 1.8-3.6 1.8-5.5.8" />
        <path className="sf-factory-stack" d="M23.2 9.1h5.4v8.1h-5.4Z" />
        <path
          className="sf-factory-body"
          d="M6.1 27.5V17.1l7.3 3.8v-4.2l7.2 4v-4h7.6v10.8H6.1Z"
        />
        <path className="sf-factory-roof" d="M6.1 17.1 13.4 20.9V16.7L20.6 20.7" />
        <path className="sf-factory-slot" d="M10.2 24.6h4.4M17.1 24.6h4.4" />
        <path className="sf-factory-sun" d="M9.4 10.2a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 0 0-4.4 0Z" />
        <text x="17.3" y="15.7" textAnchor="middle" className="sf-factory-text">
          SF
        </text>
      </svg>
    </a>
  );
}

export default function Header({ showApplyCta = true }: HeaderProps) {
  const pathname = usePathname();
  const [hideMobileCta, setHideMobileCta] = useState(false);
  const [herdState, setHerdState] = useState<{ cowCount: number; mode: HeaderHerdMode }>({
    cowCount: 0,
    mode: "filling"
  });
  const [isHerdJumping, setIsHerdJumping] = useState(false);
  const [herdJumpVariant, setHerdJumpVariant] = useState<"a" | "b">("a");

  useEffect(() => {
    if (!showApplyCta) {
      setHideMobileCta(false);
      return;
    }

    const applySection = document.querySelector("#apply");

    if (!applySection) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setHideMobileCta(entry.isIntersecting);
      },
      { threshold: 0.18 }
    );

    observer.observe(applySection);

    return () => observer.disconnect();
  }, [showApplyCta]);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      return;
    }

    const interval = window.setInterval(() => {
      setHerdState(({ cowCount, mode }) => {
        if (mode === "filling") {
          const nextCowCount = Math.min(cowCount + 1, MAX_HEADER_COWS);

          return {
            cowCount: nextCowCount,
            mode: nextCowCount === MAX_HEADER_COWS ? "emptying" : "filling"
          };
        }

        const nextCowCount = Math.max(cowCount - 1, 0);

        return {
          cowCount: nextCowCount,
          mode: nextCowCount === 0 ? "filling" : "emptying"
        };
      });
    }, HEADER_HERD_HALF_CYCLE_MS);

    return () => window.clearInterval(interval);
  }, []);

  const navItems = [
    ...homeNavItems.map((item) => ({
      label: item.label,
      href: pathname === "/" ? item.hash : `/${item.hash}`,
      isActive: false
    })),
    ...pageNavItems.map((item) => ({
      ...item,
      isActive: pathname === item.href
    }))
  ];

  const topHref = pathname === "/" ? "#top" : "/";
  const mobileApplyHref = pathname === "/" ? "#apply" : "/#apply";

  function jumpHerd() {
    setHerdJumpVariant((variant) => (variant === "a" ? "b" : "a"));
    setIsHerdJumping(true);
  }

  return (
    <>
      <header className="site-header">
        <a
          className="brand-mark"
          href={topHref}
          aria-label="목장의 아침 홈으로 이동"
          onClick={(event) => scrollToHash(event, topHref)}
        >
          <picture>
            <source media="(max-width: 720px)" srcSet="/ranch-logo-mini.svg" />
            <img src="/ranch-logo.svg" alt="목장의 아침 을왕리 에디션" />
          </picture>
        </a>

        <nav className="site-nav" aria-label="주요 메뉴">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={item.isActive ? "is-active" : undefined}
              onClick={(event) => scrollToHash(event, item.href)}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="header-tools">
          <SfFactoryLink isActive={pathname === "/sf"} />
          <PiggyBankButton />
        </div>

        <div className="header-dog-runner">
          <div className="header-herd">
            <button
              type="button"
              className={`header-herd-button${isHerdJumping ? ` is-jumping jump-${herdJumpVariant}` : ""}`}
              aria-label="강아지와 소 점프시키기"
              onClick={jumpHerd}
              onAnimationEnd={(event) => {
                if (event.animationName.startsWith("header-herd-jump")) {
                  setIsHerdJumping(false);
                }
              }}
            >
              <svg className="header-dog" viewBox="0 0 64 38" focusable="false" aria-hidden="true">
                <path className="header-dog-tail" d="M49 17c4.4-7.2 10.6-7.8 11.5-3.5.6 3.1-3.8 5.3-8.4 3.4" />
                <path
                  className="header-dog-body"
                  d="M20.5 17.1c5.2-4.9 18.7-4.4 26.1 1.1 4.2 3.1 4.8 7.1 1.5 9.6-3.8 2.9-15.5 2.7-24.1-.4-5.3-1.9-7.9-4.8-6.9-7.5.4-1.1 1.5-2.1 3.4-2.8Z"
                />
                <path className="header-dog-head" d="M19.9 12.7c-2.1-5.2-9.8-6.1-14-1.8-4.9 5-3.3 12.7 3 15.1 6.2 2.4 12.5-1.7 12.7-8.1.1-1.8-.4-3.5-1.7-5.2Z" />
                <path className="header-dog-ear" d="M14.5 8.6c.1-5.1 6.9-5.2 9.2-.2 1.7 3.8-1.6 8.5-5.3 7.4-2.2-.7-3.8-3.2-3.9-7.2Z" />
                <path className="header-dog-muzzle" d="M5.3 17.8c-2.9.1-4.5 1.7-4 3.6.6 2.4 4.2 3.3 7.4 1.7 2.7-1.4 2.7-4.3.5-5.1-1.1-.4-2.4-.4-3.9-.2Z" />
                <path className="header-dog-leg header-dog-leg-front" d="M22.3 26.5l-2.6 8h5.5" />
                <path className="header-dog-leg header-dog-leg-back" d="M42.6 26.9l4.3 7.6h-5.8" />
                <circle className="header-dog-eye" cx="10.6" cy="15" r="1.25" />
                <ellipse className="header-dog-nose" cx="3.9" cy="20.5" rx="1.8" ry="1.3" />
              </svg>
              {Array.from({ length: herdState.cowCount }, (_, index) => (
                <HeaderCow index={index} key={index} />
              ))}
            </button>
          </div>
        </div>
      </header>

      {showApplyCta ? (
        <a
          className={`mobile-sticky-cta${hideMobileCta ? " is-hidden" : ""}`}
          href={mobileApplyHref}
          onClick={(event) => scrollToHash(event, mobileApplyHref)}
        >
          참가 신청하기
        </a>
      ) : null}
    </>
  );
}
