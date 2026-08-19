"use client";

import {
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { fitConfirmedParticipants } from "@/lib/confirmedParticipantLayout";
import type { PublicReleaseCredit } from "@/lib/releaseParticipation";

type ConfirmedParticipantsProps = {
  className: string;
  credits: PublicReleaseCredit[];
  collapsible: boolean;
  contextLabel: string;
  roleLabel: string;
};

function ParticipantChip({
  credit,
  listItem = true
}: {
  credit: PublicReleaseCredit;
  listItem?: boolean;
}) {
  return (
    <span
      className="confirmed-participant-chip"
      role={listItem ? "listitem" : undefined}
    >
      <span className="confirmed-participant-mark" aria-hidden="true">✓</span>
      <span className="confirmed-participant-name">{credit.displayName}</span>
      <span className="sr-only"> 참여 확정</span>
    </span>
  );
}

function MeasureParticipantChip({ credit }: { credit: PublicReleaseCredit }) {
  return (
    <span className="confirmed-participant-chip" data-confirmed-participant-measure>
      <span className="confirmed-participant-mark">✓</span>
      <span className="confirmed-participant-name">{credit.displayName}</span>
    </span>
  );
}

export default function ConfirmedParticipants({
  className,
  credits,
  collapsible,
  contextLabel,
  roleLabel
}: ConfirmedParticipantsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const dialogId = useId();
  const creditSignature = credits.map((credit) => `${credit.id}:${credit.displayName}`).join("|");
  const [visibleCount, setVisibleCount] = useState(credits.length);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  const measure = useCallback(() => {
    if (!collapsible) {
      setVisibleCount((current) => current === credits.length ? current : credits.length);
      return;
    }

    const container = containerRef.current;
    const measureRail = measureRef.current;

    if (!container || !measureRail || container.clientWidth <= 0) {
      return;
    }

    const chipWidths = Array.from(
      measureRail.querySelectorAll<HTMLElement>("[data-confirmed-participant-measure]")
    ).map((chip) => chip.getBoundingClientRect().width);
    const more = measureRail.querySelector<HTMLElement>("[data-confirmed-participant-more-measure]");

    if (chipWidths.length !== credits.length || !more) {
      return;
    }

    const railStyle = window.getComputedStyle(measureRail);
    const gap = Number.parseFloat(railStyle.columnGap) || 0;
    const nextVisibleCount = fitConfirmedParticipants({
      availableWidth: container.clientWidth,
      chipWidths,
      gap,
      moreWidth: more.getBoundingClientRect().width
    });

    setVisibleCount((current) => current === nextVisibleCount ? current : nextVisibleCount);
  }, [collapsible, creditSignature, credits.length]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    if (!collapsible) {
      setVisibleCount(credits.length);
      return;
    }

    setPortalRoot(container.closest<HTMLElement>("main.project-page") ?? document.body);

    let frameId = 0;
    let cancelled = false;
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    };
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleMeasure);

    resizeObserver?.observe(container);
    window.addEventListener("resize", scheduleMeasure);
    scheduleMeasure();

    void document.fonts?.ready.then(() => {
      if (!cancelled) {
        scheduleMeasure();
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [collapsible, creditSignature, credits.length, measure]);

  const safeVisibleCount = collapsible
    ? Math.min(visibleCount, credits.length)
    : credits.length;
  const visibleCredits = credits.slice(0, safeVisibleCount);
  const hiddenCount = credits.length - visibleCredits.length;

  if (!collapsible) {
    return (
      <div ref={containerRef} className={`${className} confirmed-participants`} role="list" aria-label="확정 인원">
        {credits.map((credit) => (
          <ParticipantChip credit={credit} key={credit.id} />
        ))}
      </div>
    );
  }

  const rootClassName = `${className} confirmed-participants is-collapsible`;

  function openDialog() {
    setDialogOpen(true);
    window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;

      if (dialog?.isConnected && !dialog.open) {
        dialog.showModal();
        closeButtonRef.current?.focus();
      }
    });
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      closeDialog();
    }
  }

  const dialog = (
    <dialog
      ref={dialogRef}
      className="confirmed-participants-dialog"
      id={dialogId}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={handleBackdropClick}
      onClose={() => {
        const focusTarget = hiddenCount > 0
          ? moreButtonRef.current
          : containerRef.current;

        setDialogOpen(false);
        window.requestAnimationFrame(() => {
          if (focusTarget?.isConnected) {
            focusTarget.focus();
          }
        });
      }}
    >
      <div className="confirmed-participants-dialog-panel">
        <header>
          <div>
            <p id={descriptionId}>{contextLabel} / {roleLabel}</p>
            <h2 id={titleId}>확정 참여자 <span>{credits.length}명</span></h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="confirmed-participants-dialog-close"
            aria-label="확정 참여자 명단 닫기"
            onClick={closeDialog}
          >
            ×
          </button>
        </header>
        <ul aria-label={`${roleLabel} 전체 확정 참여자`} tabIndex={0}>
          {credits.map((credit) => (
            <li key={credit.id}>
              <ParticipantChip credit={credit} listItem={false} />
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );

  return (
    <>
      <div
        ref={containerRef}
        className={rootClassName}
        role="group"
        aria-label="확정 인원"
        tabIndex={-1}
      >
        <span className="confirmed-participants-visible" role="list">
          {visibleCredits.map((credit) => (
            <ParticipantChip credit={credit} key={credit.id} />
          ))}
        </span>

        {hiddenCount > 0 || dialogOpen ? (
          <button
            ref={moreButtonRef}
            type="button"
            className="confirmed-participant-more"
            aria-haspopup="dialog"
            aria-controls={dialogId}
            aria-expanded={dialogOpen}
            aria-label={hiddenCount > 0
              ? `${roleLabel} 확정 참여자 전체 보기, ${hiddenCount}명 더 있음`
              : `${roleLabel} 확정 참여자 전체 보기`}
            onClick={openDialog}
          >
            MORE
          </button>
        ) : null}

        <span ref={measureRef} className="confirmed-participants-measure" aria-hidden="true">
          {credits.map((credit) => (
            <MeasureParticipantChip credit={credit} key={credit.id} />
          ))}
          <span
            className="confirmed-participant-more"
            data-confirmed-participant-more-measure
          >
            MORE
          </span>
        </span>
      </div>

      {portalRoot ? createPortal(dialog, portalRoot) : null}
    </>
  );
}
