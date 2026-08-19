"use client";

import {
  type MouseEvent,
  useEffect,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";

const TRACE_STAGES = [
  {
    key: "galaxy",
    label: "우리 은하",
    system: "MILKY WAY / ORION SPUR",
    duration: 1250,
    media: "milky-way",
    mobileMedia: "milky-way-mobile"
  },
  {
    key: "solar",
    label: "태양계",
    system: "SOLAR SYSTEM LOCK",
    duration: 1100,
    media: "solar-system",
    mobileMedia: "solar-system-mobile"
  },
  {
    key: "earth",
    label: "지구",
    system: "PLANET LOCK",
    duration: 1050,
    media: "solar-system",
    mobileMedia: "solar-system-mobile"
  },
  {
    key: "asia",
    label: "아시아",
    system: "REGION LOCK",
    duration: 950,
    media: "earth-orbit"
  },
  {
    key: "korea",
    label: "대한민국",
    system: "NATIONAL GRID",
    duration: 900,
    media: "korea-orbit"
  },
  {
    key: "gimpo",
    label: "김포",
    system: "CITY LOCK",
    duration: 900,
    media: "gimpo-region-aerial",
    mobileMedia: "gimpo-region-aerial-mobile"
  },
  {
    key: "sau",
    label: "사우동",
    system: "DISTRICT LOCK",
    duration: 900,
    media: "gimpo-aerial"
  },
  {
    key: "exit",
    label: "사우역 2번 출구",
    system: "EXIT 02 LOCK",
    duration: 1000,
    media: "sau-station-exit"
  },
  {
    key: "venue",
    label: "시그마프라자",
    system: "7F TARGET LOCKED",
    duration: 0,
    media: "sigma-plaza"
  }
] as const;

const LAST_STAGE = TRACE_STAGES.length - 1;

type LocationJourneyDialogProps = {
  accessibleDateTime: string;
  dateLabel: string;
  dateTime: string;
  timeLabel: string;
  venue: string;
};

type MeetingCountdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  started: boolean;
};

function getMeetingCountdown(targetTime: number, now: number): MeetingCountdown {
  const remainingSeconds = Math.max(0, Math.ceil((targetTime - now) / 1000));

  if (remainingSeconds === 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, started: true };
  }

  return {
    days: Math.floor(remainingSeconds / 86_400),
    hours: Math.floor((remainingSeconds % 86_400) / 3_600),
    minutes: Math.floor((remainingSeconds % 3_600) / 60),
    seconds: remainingSeconds % 60,
    started: false
  };
}

function padClockUnit(value: number) {
  return String(value).padStart(2, "0");
}

export default function LocationJourneyDialog({
  accessibleDateTime,
  dateLabel,
  dateTime,
  timeLabel,
  venue
}: LocationJourneyDialogProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const journeyRunRef = useRef(0);
  const countdownStartedAnnouncedRef = useRef(false);
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
  const [readyStages, setReadyStages] = useState<Set<number>>(() => new Set());
  const [countdownNow, setCountdownNow] = useState<number | null>(null);
  const [showFinalReadout, setShowFinalReadout] = useState(false);

  const stage = TRACE_STAGES[activeStage];
  const isComplete = activeStage === LAST_STAGE;
  const targetTime = Date.parse(dateTime);
  const countdown = countdownNow === null || !Number.isFinite(targetTime)
    ? null
    : getMeetingCountdown(targetTime, countdownNow);

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

      if (limited) {
        journeyRunRef.current += 1;
      }
      setMotionLimited(limited);
    }

    function handleSiteMotionChange(event: Event) {
      const paused = (event as CustomEvent<{ paused: boolean }>).detail.paused;
      if (reducedMotion.matches || paused) {
        journeyRunRef.current += 1;
      }
      setMotionLimited(reducedMotion.matches || paused);
    }

    function handleVisibilityChange() {
      journeyRunRef.current += 1;
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
      journeyRunRef.current += 1;
      stageClockRef.current = { stage: LAST_STAGE, remaining: 0, startedAt: 0 };
      setActiveStage(LAST_STAGE);
      setPlaybackPaused(false);
    }
  }, [isOpen, motionLimited]);

  useEffect(() => {
    if (
      !isOpen ||
      motionLimited ||
      playbackPaused ||
      !pageVisible ||
      isComplete ||
      !readyStages.has(activeStage) ||
      !readyStages.has(activeStage + 1)
    ) {
      return;
    }

    const clock = stageClockRef.current;

    if (clock.stage !== activeStage) {
      clock.stage = activeStage;
      clock.remaining = stage.duration;
    }

    const remaining = Math.max(clock.remaining, 0);
    clock.startedAt = performance.now();
    const scheduledStage = activeStage;
    const scheduledRun = journeyRunRef.current;
    const timeoutId = window.setTimeout(() => {
      if (journeyRunRef.current !== scheduledRun) {
        return;
      }

      setActiveStage((current) =>
        current === scheduledStage ? Math.min(current + 1, LAST_STAGE) : current
      );
    }, remaining);

    return () => {
      window.clearTimeout(timeoutId);

      if (clock.stage === activeStage) {
        clock.remaining = Math.max(0, remaining - (performance.now() - clock.startedAt));
      }
    };
  }, [
    activeStage,
    isComplete,
    isOpen,
    motionLimited,
    pageVisible,
    playbackPaused,
    readyStages,
    stage.duration
  ]);

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
      setAnnouncement(`위치 확인 완료: ${venue} 7층. 다음 모임 ${accessibleDateTime}.`);
    }
  }, [accessibleDateTime, isComplete, isOpen, venue]);

  useEffect(() => {
    if (!isOpen || !isComplete) {
      setShowFinalReadout(false);
      return;
    }

    if (motionLimited) {
      setShowFinalReadout(true);
      return;
    }

    if (!pageVisible) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowFinalReadout(true);
    }, 1650);

    return () => window.clearTimeout(timeoutId);
  }, [isComplete, isOpen, motionLimited, pageVisible]);

  useEffect(() => {
    if (!isOpen || !isComplete) {
      setCountdownNow(null);
      return;
    }

    if (!pageVisible || !Number.isFinite(targetTime)) {
      return;
    }

    let timeoutId = 0;

    function updateCountdown() {
      const now = Date.now();
      setCountdownNow(now);

      if (now >= targetTime) {
        return;
      }

      timeoutId = window.setTimeout(updateCountdown, 1000 - (now % 1000) + 20);
    }

    updateCountdown();

    return () => window.clearTimeout(timeoutId);
  }, [isComplete, isOpen, pageVisible, targetTime]);

  useEffect(() => {
    if (
      !isOpen ||
      !isComplete ||
      !countdown?.started ||
      countdownStartedAnnouncedRef.current
    ) {
      return;
    }

    countdownStartedAnnouncedRef.current = true;
    setAnnouncement(`다음 모임 ${accessibleDateTime} 한국 표준시. 모임 시작 시각이 되었습니다.`);
  }, [accessibleDateTime, countdown?.started, isComplete, isOpen]);

  function openDialog() {
    const dialog = dialogRef.current;

    if (!dialog || dialog.open) {
      return;
    }

    const limited =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("site-motion-paused");

    journeyRunRef.current += 1;
    countdownStartedAnnouncedRef.current = false;
    setMotionLimited(limited);
    setActiveStage(limited ? LAST_STAGE : 0);
    stageClockRef.current = {
      stage: limited ? LAST_STAGE : 0,
      remaining: limited ? 0 : TRACE_STAGES[0].duration,
      startedAt: 0
    };
    setPlaybackPaused(false);
    setAnnouncement("");
    setCountdownNow(null);
    setShowFinalReadout(false);
    setReadyStages(new Set());
    setIsOpen(true);
    document.documentElement.classList.add("location-trace-open");
    dialog.showModal();
  }

  function closeDialog() {
    journeyRunRef.current += 1;
    dialogRef.current?.close();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      closeDialog();
    }
  }

  function handleClose() {
    journeyRunRef.current += 1;
    countdownStartedAnnouncedRef.current = false;
    setIsOpen(false);
    setActiveStage(0);
    setPlaybackPaused(false);
    setAnnouncement("");
    setCountdownNow(null);
    setShowFinalReadout(false);
    setReadyStages(new Set());
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
    journeyRunRef.current += 1;
    setPlaybackPaused(false);
    stageClockRef.current = { stage: LAST_STAGE, remaining: 0, startedAt: 0 };
    setActiveStage(LAST_STAGE);
  }

  function replayTrace() {
    if (motionLimited) {
      return;
    }

    journeyRunRef.current += 1;
    countdownStartedAnnouncedRef.current = false;
    setAnnouncement("");
    setCountdownNow(null);
    setShowFinalReadout(false);
    setPlaybackPaused(false);
    stageClockRef.current = {
      stage: 0,
      remaining: TRACE_STAGES[0].duration,
      startedAt: 0
    };
    setActiveStage(0);
  }

  function markStageReady(index: number) {
    setReadyStages((current) => {
      if (current.has(index)) {
        return current;
      }

      const next = new Set(current);
      next.add(index);
      return next;
    });
  }

  function togglePlayback() {
    journeyRunRef.current += 1;
    setPlaybackPaused((paused) => !paused);
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
          {venue} 7층을 향해 위치를 추적합니다. 다음 모임은 {accessibleDateTime} 한국 표준시입니다.
        </p>

        <div className="location-trace-visual" aria-hidden="true">
          <div className="location-trace-media-stack">
            {TRACE_STAGES.map((traceStage, index) => {
              const distance = Math.abs(index - activeStage);
              const shouldRender = isOpen && (distance <= 2 || (motionLimited && index === LAST_STAGE));

              if (!shouldRender) {
                return null;
              }

              const mediaPath = `/location-trace/${traceStage.media}`;
              const mobileMedia = "mobileMedia" in traceStage
                ? `/location-trace/${traceStage.mobileMedia}`
                : null;

              return (
                <picture
                  className={`location-trace-media-frame${index === activeStage ? " is-active" : ""}${index < activeStage ? " is-before" : ""}${readyStages.has(index) ? " is-ready" : ""}`}
                  data-trace-stage={traceStage.key}
                  key={traceStage.key}
                >
                  {mobileMedia ? (
                    <>
                      <source media="(max-width: 720px) and (orientation: portrait)" srcSet={`${mobileMedia}.avif`} type="image/avif" />
                      <source media="(max-width: 720px) and (orientation: portrait)" srcSet={`${mobileMedia}.webp`} type="image/webp" />
                    </>
                  ) : null}
                  <source srcSet={`${mediaPath}.avif`} type="image/avif" />
                  <img
                    src={`${mediaPath}.webp`}
                    alt=""
                    width="1672"
                    height="941"
                    draggable={false}
                    decoding="async"
                    loading={distance <= 1 ? "eager" : "lazy"}
                    onLoad={() => markStageReady(index)}
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                      markStageReady(index);
                    }}
                  />
                </picture>
              );
            })}
          </div>

          <div className="location-trace-media-grade" />
          <div className="location-trace-sweep" />
          <div className="location-trace-reticle">
            <i /><i /><span /><span />
          </div>
        </div>

        <header className="location-trace-header" aria-hidden="true">
          <p><i /> SATELLITE TRACE</p>
        </header>

        <div className="location-trace-stage-copy" aria-hidden="true" key={stage.key}>
          <strong>{stage.label}</strong>
          <small>{stage.system}</small>
          {isComplete && showFinalReadout && countdown ? (
            <div className="location-trace-session-hud">
              <p><i /> RENDEZVOUS WINDOW</p>
              <time dateTime={dateTime}>{dateLabel} / {timeLabel} KST</time>
              <div className="location-trace-countdown">
                {countdown.started ? (
                  <strong>SESSION LIVE</strong>
                ) : (
                  <>
                    <strong>{countdown.days === 0 ? "D-DAY" : `D-${countdown.days}`}</strong>
                    <span>
                      <b>{padClockUnit(countdown.hours)}</b><i>H</i>
                      <b>{padClockUnit(countdown.minutes)}</b><i>M</i>
                      <b>{padClockUnit(countdown.seconds)}</b><i>S</i>
                    </span>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {isComplete && countdown ? (
          <p className="studio-visually-hidden">
            다음 모임 {accessibleDateTime}. {countdown.started
              ? "모임 시작 시각이 되었습니다."
              : `${countdown.days}일 ${countdown.hours}시간 ${countdown.minutes}분 남았습니다.`}
          </p>
        ) : null}

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
              onClick={isComplete ? replayTrace : togglePlayback}
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
