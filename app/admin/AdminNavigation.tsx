"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type MouseEvent,
  useEffect,
  useRef,
  useState
} from "react";

type NavigationItem = {
  href: string;
  label: string;
  exact?: boolean;
  aliases?: string[];
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

type AdminNavigationProject = {
  slug: string;
  shortTitle: string;
  lifecycle: "active" | "completed" | "archived";
};

const BASE_NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    label: "대시보드",
    items: [
      { href: "/admin", label: "운영 현황", exact: true }
    ]
  },
  {
    label: "메인 운영",
    items: [
      { href: "/admin/main", label: "메인 설정" },
      { href: "/admin/proposals", label: "프로젝트 제안" }
    ]
  },
  {
    label: "프로젝트 관리",
    items: [
      { href: "/admin/projects", label: "프로젝트 목록", exact: true },
      {
        href: "/admin/release-applications",
        label: "참여 신청",
        aliases: ["/admin/applications"]
      }
    ]
  }
];

function pathMatches(pathname: string, path: string, exact = false) {
  return exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
}

function NavigationLinks({
  onNavigate,
  pathname,
  projects
}: {
  onNavigate?: () => void;
  pathname: string;
  projects: AdminNavigationProject[];
}) {
  const navigationGroups: NavigationGroup[] = BASE_NAVIGATION_GROUPS.map((group) => (
    group.label !== "프로젝트 관리"
      ? group
      : {
          ...group,
          items: [
            ...group.items,
            ...projects.map((project) => ({
              href: `/admin/projects/${project.slug}`,
              label: `${project.shortTitle}${project.lifecycle === "active" ? "" : project.lifecycle === "completed" ? " · 완료" : " · 보관"}`
            }))
          ]
        }
  ));

  return (
    <>
      <Link className="admin-console-brand" href="/admin" onClick={onNavigate} prefetch={false}>
        <small>MORNING RANCH</small>
        <strong>ADMIN CONSOLE</strong>
      </Link>

      <nav className="admin-console-navigation" aria-label="관리자 메뉴">
        {navigationGroups.map((group) => (
          <section className="admin-console-nav-group" aria-label={group.label} key={group.label}>
            <p>{group.label}</p>
            <div>
              {group.items.map((item) => {
                const aliasActive = item.aliases?.some((alias) => pathMatches(pathname, alias)) ?? false;
                const active = aliasActive || pathMatches(pathname, item.href, item.exact);

                return (
                  <Link
                    className="admin-console-nav-link"
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    data-active={active || undefined}
                    onClick={onNavigate}
                    prefetch={false}
                    key={item.href}
                  >
                    <span>{item.label}</span>
                    <i aria-hidden="true">↗</i>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="admin-console-footer-actions">
        <Link href="/" onClick={onNavigate}>사이트 보기</Link>
        <form action="/api/admin/logout" method="post">
          <button type="submit">로그아웃</button>
        </form>
      </div>
    </>
  );
}

export default function AdminNavigation({ projects }: { projects: AdminNavigationProject[] }) {
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreTriggerFocusRef = useRef(true);
  const focusMainContentRef = useRef(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog?.open) {
      dialog.close();
    }

    if (focusMainContentRef.current) {
      focusMainContentRef.current = false;
      window.requestAnimationFrame(() => {
        document.getElementById("admin-main-content")?.focus();
      });
    }
  }, [pathname]);

  function openDrawer() {
    const dialog = dialogRef.current;

    if (dialog && !dialog.open) {
      restoreTriggerFocusRef.current = true;
      focusMainContentRef.current = false;
      dialog.showModal();
      setDrawerOpen(true);
    }
  }

  function closeDrawer() {
    restoreTriggerFocusRef.current = true;
    dialogRef.current?.close();
  }

  function closeDrawerForNavigation() {
    restoreTriggerFocusRef.current = false;
    focusMainContentRef.current = true;
    dialogRef.current?.close();
  }

  function handleDialogClose() {
    setDrawerOpen(false);
    window.requestAnimationFrame(() => {
      if (restoreTriggerFocusRef.current && triggerRef.current?.isConnected) {
        triggerRef.current.focus();
      } else {
        document.getElementById("admin-main-content")?.focus();
      }
    });
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      closeDrawer();
    }
  }

  return (
    <>
      <a className="admin-console-skip-link" href="#admin-main-content">
        본문으로 건너뛰기
      </a>

      <aside className="admin-console-sidebar" aria-label="관리자 사이드바">
        <NavigationLinks pathname={pathname} projects={projects} />
      </aside>

      <div className="admin-console-mobile-bar">
        <Link href="/admin" prefetch={false}>
          <small>MORNING RANCH</small>
          <strong>ADMIN</strong>
        </Link>
        <button
          ref={triggerRef}
          type="button"
          aria-controls="admin-mobile-navigation"
          aria-expanded={drawerOpen}
          aria-haspopup="dialog"
          onClick={openDrawer}
        >
          메뉴
        </button>
      </div>

      <dialog
        ref={dialogRef}
        id="admin-mobile-navigation"
        className="admin-console-drawer"
        aria-labelledby="admin-mobile-navigation-title"
        onClick={handleBackdropClick}
        onClose={handleDialogClose}
      >
        <div className="admin-console-drawer-panel">
          <header>
            <strong id="admin-mobile-navigation-title">관리자 메뉴</strong>
            <button type="button" onClick={closeDrawer} autoFocus aria-label="관리자 메뉴 닫기">
              ×
            </button>
          </header>
          <NavigationLinks
            pathname={pathname}
            projects={projects}
            onNavigate={closeDrawerForNavigation}
          />
        </div>
      </dialog>
    </>
  );
}
