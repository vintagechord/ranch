"use client";

import {
  type MouseEvent,
  useEffect,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";

const TRACE_STAGES = [
  { key: "space", label: "우주", system: "ORBITAL SEARCH", duration: 1100 },
  { key: "earth", label: "지구", system: "PLANET LOCK", duration: 1050 },
  { key: "asia", label: "아시아", system: "REGION LOCK", duration: 950 },
  { key: "korea", label: "대한민국", system: "NATIONAL GRID", duration: 900 },
  { key: "gimpo", label: "김포", system: "CITY LOCK", duration: 900 },
  { key: "sau", label: "사우동", system: "DISTRICT LOCK", duration: 900 },
  { key: "exit", label: "사우역 2번 출구", system: "EXIT 02 LOCK", duration: 1000 },
  { key: "venue", label: "시그마프라자", system: "TARGET LOCKED", duration: 0 }
] as const;

const LAST_STAGE = TRACE_STAGES.length - 1;

const ROAD_SEGMENTS = [
  { left: "7%", top: "19%", width: "72%", rotate: "12deg" },
  { left: "18%", top: "29%", width: "74%", rotate: "-17deg" },
  { left: "4%", top: "47%", width: "88%", rotate: "4deg" },
  { left: "11%", top: "66%", width: "76%", rotate: "-9deg" },
  { left: "27%", top: "8%", width: "68%", rotate: "61deg" },
  { left: "51%", top: "4%", width: "72%", rotate: "94deg" },
  { left: "66%", top: "22%", width: "55%", rotate: "117deg" },
  { left: "13%", top: "84%", width: "69%", rotate: "-31deg" }
] as const;

type LocationJourneyDialogProps = {
  venue: string;
};

export default function LocationJourneyDialog({ venue }: LocationJourneyDialogProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const stageClockRef = useRef<{ stage: number; remaining: number; startedAt: number }>({
    stage: 0,
    remaining: TRACE_STAGES[0].duration,
    startedAt: 0
  });
  const [portalReady, setPortalReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeStage, setActiveStage] = useState(0);
  const [playbackPaused, setPlaybackPaused] = useState(false);
  const [motionLimited, setMotionLimited] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [announcement, setAnnouncement] = useState("");

  const stage = TRACE_STAGES[activeStage];
  const isComplete = activeStage === LAST_STAGE;

  useEffect(() => {
    setPortalReady(true);

    return () => {
      document.documentElement.classList.remove("location-trace-open");
    };
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function syncMotionPreference() {
      const limited =
        reducedMotion.matches || document.documentElement.classList.contains("site-motion-paused");

      setMotionLimited(limited);
    }

    function handleSiteMotionChange(event: Event) {
      const paused = (event as CustomEvent<{ paused: boolean }>).detail.paused;
      setMotionLimited(reducedMotion.matches || paused);
    }

    function handleVisibilityChange() {
      setPageVisible(!document.hidden);
    }

    syncMotionPreference();
    handleVisibilityChange();
    reducedMotion.addEventListener("change", syncMotionPreference);
    window.addEventListener("morning-ranch-motion-change", handleSiteMotionChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      reducedMotion.removeEventListener("change", syncMotionPreference);
      window.removeEventListener("morning-ranch-motion-change", handleSiteMotionChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (isOpen && motionLimited) {
      stageClockRef.current = { stage: LAST_STAGE, remaining: 0, startedAt: 0 };
      setActiveStage(LAST_STAGE);
      setPlaybackPaused(false);
    }
  }, [isOpen, motionLimited]);

  useEffect(() => {
    if (!isOpen || motionLimited || playbackPaused || !pageVisible || isComplete) {
      return;
    }

    const clock = stageClockRef.current;

    if (clock.stage !== activeStage) {
      clock.stage = activeStage;
      clock.remaining = stage.duration;
    }

    const remaining = Math.max(clock.remaining, 0);
    clock.startedAt = performance.now();
    const timeoutId = window.setTimeout(() => {
      setActiveStage((current) => Math.min(current + 1, LAST_STAGE));
    }, remaining);

    return () => {
      window.clearTimeout(timeoutId);

      if (clock.stage === activeStage) {
        clock.remaining = Math.max(0, remaining - (performance.now() - clock.startedAt));
      }
    };
  }, [activeStage, isComplete, isOpen, motionLimited, pageVisible, playbackPaused, stage.duration]);

  useEffect(() => {
    if (!isOpen || motionLimited) {
      return;
    }

    const animations = shellRef.current?.getAnimations({ subtree: true }) ?? [];
    const shouldPause = playbackPaused || !pageVisible;

    animations.forEach((animation) => {
      if (shouldPause && animation.playState === "running") {
        animation.pause();
      } else if (!shouldPause && animation.playState === "paused") {
        animation.play();
      }
    });
  }, [isOpen, motionLimited, pageVisible, playbackPaused]);

  useEffect(() => {
    if (isOpen && isComplete) {
      setAnnouncement(`위치 확인 완료: ${venue}`);
    }
  }, [isComplete, isOpen, venue]);

  function openDialog() {
    const dialog = dialogRef.current;

    if (!dialog || dialog.open) {
      return;
    }

    const limited =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("site-motion-paused");

    setMotionLimited(limited);
    setActiveStage(limited ? LAST_STAGE : 0);
    stageClockRef.current = {
      stage: limited ? LAST_STAGE : 0,
      remaining: limited ? 0 : TRACE_STAGES[0].duration,
      startedAt: 0
    };
    setPlaybackPaused(false);
    setAnnouncement("");
    setIsOpen(true);
    document.documentElement.classList.add("location-trace-open");
    dialog.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      closeDialog();
    }
  }

  function handleClose() {
    setIsOpen(false);
    setActiveStage(0);
    setPlaybackPaused(false);
    setAnnouncement("");
    stageClockRef.current = {
      stage: 0,
      remaining: TRACE_STAGES[0].duration,
      startedAt: 0
    };
    document.documentElement.classList.remove("location-trace-open");

    window.requestAnimationFrame(() => {
      if (triggerRef.current?.isConnected) {
        triggerRef.current.focus();
      }
    });
  }

  function skipToTarget() {
    setPlaybackPaused(false);
    stageClockRef.current = { stage: LAST_STAGE, remaining: 0, startedAt: 0 };
    setActiveStage(LAST_STAGE);
  }

  function replayTrace() {
    if (motionLimited) {
      return;
    }

    setAnnouncement("");
    setPlaybackPaused(false);
    stageClockRef.current = {
      stage: 0,
      remaining: TRACE_STAGES[0].duration,
      startedAt: 0
    };
    setActiveStage(0);
  }

  const dialog = (
    <dialog
      ref={dialogRef}
      id="studio-location-trace"
      className="location-trace-dialog"
      aria-labelledby="location-trace-title"
      aria-describedby="location-trace-description"
      onClick={handleBackdropClick}
      onClose={handleClose}
    >
      <section
        ref={shellRef}
        className={`location-trace-shell${playbackPaused ? " is-playback-paused" : ""}`}
        data-stage={stage.key}
      >
        <h2 id="location-trace-title" className="studio-visually-hidden">
          {venue} 위치 추적
        </h2>
        <p id="location-trace-description" className="studio-visually-hidden">
          우주에서 지구, 아시아, 대한민국, 김포, 사우동, 사우역 2번 출구를 거쳐
          {venue}까지 위치를 추적합니다.
        </p>

        <div className="location-trace-visual" aria-hidden="true">
          <div className="location-trace-stars is-far" />
          <div className="location-trace-stars is-near" />

          <div className="location-trace-orbit">
            <div className="location-trace-earth"><i /><i /><i /><i /></div>
            <div className="location-trace-orbit-line" />
            <div className="location-trace-satellite"><i /></div>
          </div>

          <div className="location-trace-map">
            <div className="location-trace-contours"><i /><i /><i /></div>
            <div className="location-trace-region is-asia"><i /><i /></div>
            <div className="location-trace-region is-korea"><i /><i /><i /></div>
            <div className="location-trace-roads">
              {ROAD_SEGMENTS.map((road, index) => (
                <i
                  key={index}
                  style={{
                    left: road.left,
                    top: road.top,
                    width: road.width,
                    transform: `rotate(${road.rotate})`
                  }}
                />
              ))}
            </div>
            <div className="location-trace-blocks">
              {Array.from({ length: 20 }, (_, index) => (
                <i key={index} />
              ))}
            </div>
            <div className="location-trace-rail">
              <span /><span /><span className="is-exit-two" /><span />
            </div>
            <div className="location-trace-building"><i /><i /><i /></div>
          </div>

          <div className="location-trace-sweep" />
          <div className="location-trace-reticle">
            <i /><i /><span /><span />
          </div>
        </div>

        <header className="location-trace-header" aria-hidden="true">
          <p><i /> SATELLITE TRACE</p>
          <span>POSITIONING SYSTEM / {String(activeStage + 1).padStart(2, "0")}</span>
        </header>

        <div className="location-trace-stage-copy" aria-hidden="true" key={stage.key}>
          <span>{String(activeStage + 1).padStart(2, "0")} / 08</span>
          <strong>{stage.label}</strong>
          <small>{stage.system}</small>
        </div>

        <ol className="location-trace-route" aria-hidden="true">
          {TRACE_STAGES.map((traceStage, index) => (
            <li
              className={
                index === activeStage ? "is-current" : index < activeStage ? "is-complete" : ""
              }
              key={traceStage.key}
            >
              <i />
              <span>{traceStage.label}</span>
            </li>
          ))}
        </ol>

        <div className="location-trace-controls">
          {!motionLimited ? (
            <button
              type="button"
              className="location-trace-pause"
              aria-label={
                isComplete
                  ? "위치 추적 다시 재생"
                  : playbackPaused
                    ? "위치 추적 계속 재생"
                    : "위치 추적 일시정지"
              }
              aria-pressed={isComplete ? undefined : playbackPaused}
              onClick={isComplete ? replayTrace : () => setPlaybackPaused((paused) => !paused)}
            >
              <span aria-hidden="true">{isComplete ? "↻" : playbackPaused ? "▶" : "Ⅱ"}</span>
            </button>
          ) : null}

          <button
            type="button"
            aria-label={isComplete ? "위치 정보 닫기" : "최종 위치로 건너뛰기"}
            onClick={isComplete ? closeDialog : skipToTarget}
          >
            {isComplete ? "CLOSE" : "SKIP"}
          </button>
        </div>

        <button
          type="button"
          className="location-trace-close"
          aria-label="위치 정보 닫기"
          autoFocus
          onClick={closeDialog}
        >
          <span aria-hidden="true">×</span>
        </button>

        <p className="studio-visually-hidden" role="status" aria-live="polite">
          {announcement}
        </p>
      </section>
    </dialog>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="studio-monitor-session-location"
        aria-label={`${venue} 위치 추적 열기`}
        aria-haspopup="dialog"
        aria-controls="studio-location-trace"
        aria-expanded={isOpen}
        onClick={openDialog}
      >
        <small>장소:</small>
        <strong>{venue}</strong>
      </button>
      {portalReady ? createPortal(dialog, document.body) : null}
    </>
  );
}
