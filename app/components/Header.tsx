"use client";

import { type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import MotionToggle from "@/app/components/MotionToggle";
import PiggyBankButton from "@/app/components/PiggyBankButton";
import { activeProjects, type Project } from "@/lib/projects";

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
  projects?: Project[];
};

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

export default function Header({ projects = activeProjects }: HeaderProps) {
  const pathname = usePathname();
  const topHref = pathname === "/" ? "#top" : "/";
  const navItems = [
    ...projects.map((project) => ({
      kind: "project" as const,
      label: project.shortTitle,
      href: `/projects/${project.slug}`
    })),
    { kind: "proposal" as const, label: "프로젝트 제안", href: "/#project-proposal" }
  ];

  return (
    <header className="site-header">
      <a
        className="brand-mark"
        href={topHref}
        aria-label="목장의 아침 홈으로 이동"
        onClick={(event) => scrollToHash(event, topHref)}
      >
        <picture>
          <source media="(max-width: 720px)" srcSet="/ranch-logo-mini.svg" />
          <img src="/ranch-logo.svg" alt="목장의 아침" />
        </picture>
      </a>

      <nav className="site-nav" aria-label="주요 메뉴">
        {navItems.map((item) => {
          const isActive = item.kind === "project" && pathname === item.href;

          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              aria-haspopup={item.kind === "proposal" ? "dialog" : undefined}
              className={isActive ? "is-active" : undefined}
              onClick={item.kind === "proposal" ? undefined : (event) => scrollToHash(event, item.href)}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      <div className="header-tools">
        <MotionToggle />
        <SfFactoryLink isActive={pathname === "/sf"} />
        <PiggyBankButton />
      </div>
    </header>
  );
}
